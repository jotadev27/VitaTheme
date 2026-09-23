import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImageConverter } from '@/application/ports/image-converter';
import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import {
  createThemeSession,
  type ExportDestination,
  type LoadedTheme,
  type ThemeSession,
} from '@/application/session/theme-session';
import { hasErrors } from '@/domain/validation/report';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { identifyMedia } from '@/infrastructure/media/media-probe';
import { convertImage } from '@/infrastructure/image/convert-image';
import { composeImage } from '@/infrastructure/image/compose-image';
import { jpegBytes, pixelsOf, pngBytes } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';
import { readZipArchive, zipEntryNames } from '../support/zip-reader';

/**
 * Converting a picture, from the editing session's side.
 *
 * A conversion is not a special kind of change: it is one step to take back, it makes the
 * project unsaved, it is saved and exported like anything else. That is the whole point of
 * putting the result through the staging the editor already had, and it is what these check.
 */

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

let workspace: string;
let session: ThemeSession;

const newSession = (images?: ImageConverter): ThemeSession =>
  createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: fileSystemExternalFiles(),
    ...sessionAdapters(workspace),
    ...(images === undefined ? {} : { images }),
  });

const BACKGROUND: ThemeAssetSlot = { kind: 'liveAreaBackground', page: 0 };

describe('cropping a chosen image before assignment', () => {
  it('commits one change that survives undo, redo, save, reopen and both exports', async () => {
    const source = await chosenPhoto('positioned.jpg');
    const original = await readFile(source);
    const applied = await session.assignCroppedAsset(BACKGROUND, original, {
      zoom: 1.25,
      x: 0.6,
      y: -0.4,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.project.home.pages[0]).toMatchObject({
      background: 'background-1.png',
      thumbnail: 'background-thumbnail-1.png',
      generatedThumbnail: true,
    });
    expect(applied.value.isDirty).toBe(true);
    expect(applied.value.report.issues.map((issue) => issue.code)).not.toContain(
      'asset.wrong-dimensions',
    );
    const cropped = await session.readAsset('background-1.png' as never);
    expect(cropped?.ok).toBe(true);
    expect((await readFile(source)).equals(original)).toBe(true);

    expect((await session.undo())?.project.home.pages[0]?.background).toBeNull();
    expect((await session.redo())?.project.home.pages[0]?.background).toBe('background-1.png');
    expect(await session.readAsset('background-1.png' as never)).toEqual(cropped);

    const projectPath = join(workspace, 'Positioned.vitatheme');
    expect((await session.saveTo(projectPath, 'Positioned')).ok).toBe(true);
    session = newSession();
    expect((await session.openProject(projectPath, 'Positioned')).ok).toBe(true);
    expect(await session.readAsset('background-1.png' as never)).toEqual(cropped);

    expect(
      (
        await session.exportTo({
          kind: 'folder',
          path: join(workspace, 'PositionedExport'),
          overwrite: false,
        })
      )?.status,
    ).toBe('exported');
    expect(
      new Uint8Array(await readFile(join(workspace, 'PositionedExport', 'background-1.png'))),
    ).toEqual(cropped?.ok ? cropped.value : null);
    const archivePath = join(workspace, 'Positioned.zip');
    expect(
      (await session.exportTo({ kind: 'archive', path: archivePath, overwrite: false }))?.status,
    ).toBe('exported');
    expect(zipEntryNames(readZipArchive(await readFile(archivePath)))).toContain(
      'background-1.png',
    );
  });
});

/** A picture somebody chose: the wrong size, the wrong format, and full of colours. */
const chosenPhoto = async (name = 'holiday.jpg'): Promise<string> => {
  const path = join(workspace, name);
  await writeFile(path, await jpegBytes({ width: 1600, height: 1200 }));
  return path;
};

const assign = async (
  location: string,
  slot: ThemeAssetSlot = BACKGROUND,
): Promise<LoadedTheme> => {
  const assigned = await session.assignAsset(slot, location);
  if (!assigned.ok) {
    throw new Error(`Expected the file to be assigned: ${assigned.error.message}`);
  }
  return assigned.value;
};

const convert = async (slot: ThemeAssetSlot = BACKGROUND) => {
  const converted = await session.convertAsset(slot, 'cover');
  if (!converted.ok) {
    throw new Error(`Expected the conversion to succeed: ${converted.error.message}`);
  }
  return converted.value;
};

const mediaOf = (theme: LoadedTheme, path: string) => {
  const summary = theme.assets.find((candidate) => candidate.path === path);
  return summary?.lookup.status === 'found' ? summary.lookup.asset.media : null;
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-convert-'));
  session = newSession();
  session.startDraft({ title: 'Converted Theme', provider: 'Someone' });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('converting what is in a slot', () => {
  it('keeps a circular page indicator transparent when exported', async () => {
    const source = join(workspace, 'square-dot.png');
    await writeFile(source, await pngBytes({ width: 22, height: 22 }));
    const slot = { kind: 'basePageIndicator' } as const;
    await assign(source, slot);

    const converted = await session.convertAsset(slot, 'cover', {
      zoom: 1,
      x: 0,
      y: 0,
      shape: 'circle',
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const path = converted.value.theme.project.home.basePageIndicator;
    expect(path).not.toBeNull();
    if (path === null) return;

    const destination = join(workspace, 'CircularTheme');
    expect(
      (await session.exportTo({ kind: 'folder', path: destination, overwrite: false }))?.status,
    ).toBe('exported');
    const pixels = await pixelsOf(new Uint8Array(await readFile(join(destination, path))));
    expect([pixels.width, pixels.height]).toEqual([22, 22]);
    expect(pixels.at(0, 0)[3]).toBe(0);
    expect(pixels.at(11, 11)[3]).toBe(255);
  });

  it('replaces it with a picture that meets the slot’s specification', async () => {
    await assign(await chosenPhoto());
    const before = session.current();
    expect(mediaOf(before!, 'background-1.jpg')).toMatchObject({ format: 'jpeg', width: 1600 });

    const conversion = await convert();

    expect(conversion.source.media).toMatchObject({ format: 'jpeg', width: 1600, height: 1200 });
    expect(conversion.result.media).toMatchObject({ format: 'png', width: 960, height: 512 });
    expect(conversion.theme.project.home.pages[0]?.background).toBe('background-1.png');
  });

  it('clears the problems the validator was reporting about it', async () => {
    await assign(await chosenPhoto());
    const before = session.current();
    expect(hasErrors(before!.report)).toBe(true);

    const conversion = await convert();

    const codes = conversion.theme.report.issues.map((issue) => issue.code);
    expect(codes).not.toContain('asset.wrong-image-format');
    expect(codes).not.toContain('asset.wrong-dimensions');
    expect(codes).not.toContain('asset.not-indexed');
  });

  it('leaves the file it was given exactly as it was', async () => {
    const path = await chosenPhoto();
    const before = await readFile(path);
    await assign(path);

    await convert();

    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it('makes the project unsaved, because the theme now holds something else', async () => {
    await assign(await chosenPhoto());
    await session.saveTo(join(workspace, 'Theme.vitatheme'), 'Theme');
    expect(session.current()?.isDirty).toBe(false);

    const conversion = await convert();

    expect(conversion.theme.isDirty).toBe(true);
  });

  it('refuses when the slot holds nothing', async () => {
    const converted = await session.convertAsset(BACKGROUND, 'cover');

    expect(converted.ok || converted.error.code).toBe('nothing-to-convert');
  });

  it('refuses for background music, which is not a picture', async () => {
    const converted = await session.convertAsset({ kind: 'backgroundMusic' }, 'cover');

    expect(converted.ok || converted.error.code).toBe('not-an-image');
  });

  it('refuses when there is no theme open', async () => {
    await session.close();

    const converted = await session.convertAsset(BACKGROUND, 'cover');

    expect(converted.ok || converted.error.code).toBe('no-theme-open');
  });
});

describe('converting incompatible images together', () => {
  it('converts multiple slots as one undoable change without modifying sources', async () => {
    const background = await chosenPhoto('background.jpg');
    const icon = await chosenPhoto('browser.jpg');
    const originalBackground = await readFile(background);
    const originalIcon = await readFile(icon);
    await assign(background);
    await assign(icon, { kind: 'appIcon', application: 'browser' });
    const before = session.current();

    const outcome = await session.convertIncompatibleImages('contain');

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.converted).toHaveLength(2);
    expect(outcome.value.theme.project.home.pages[0]?.background).toBe('background-1.png');
    expect(outcome.value.theme.project.home.appIcons.get('browser')).toBe('icon-browser.png');
    expect(outcome.value.theme.report.issues.map((issue) => issue.code)).not.toContain(
      'asset.wrong-image-format',
    );
    expect((await readFile(background)).equals(originalBackground)).toBe(true);
    expect((await readFile(icon)).equals(originalIcon)).toBe(true);

    const undone = await session.undo();
    expect(undone?.project).toEqual(before?.project);
    expect((await session.redo())?.project).toEqual(outcome.value.theme.project);
  });

  it('keeps every slot unchanged when a later conversion fails', async () => {
    let calls = 0;
    session = newSession({
      convert: async (bytes, target, fit) => {
        calls += 1;
        return calls === 2
          ? {
              ok: false as const,
              error: { code: 'undecodable' as const, message: 'Second image failed.' },
            }
          : convertImage(bytes, target, fit);
      },
      compose: composeImage,
    });
    session.startDraft({ title: 'Bulk', provider: 'Tests' });
    await assign(await chosenPhoto('first.jpg'));
    await assign(await chosenPhoto('second.jpg'), { kind: 'appIcon', application: 'browser' });
    const before = session.current();

    const outcome = await session.convertIncompatibleImages('cover');

    expect(outcome.ok).toBe(false);
    expect(session.current()?.project).toEqual(before?.project);
    expect(session.current()?.revision).toBe(before?.revision);
    expect(session.current()?.assetRevision).toBe(before?.assetRevision);
  });
});

describe('a conversion that fails', () => {
  it('leaves the theme exactly as it was', async () => {
    await assign(await chosenPhoto());
    const before = session.current();

    const refused = () =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'undecodable' as const, message: 'That image could not be read.' },
      });
    let calls = 0;
    const refusing: ImageConverter = {
      convert: (bytes, target, fit) => {
        calls += 1;
        return calls === 1 ? convertImage(bytes, target, fit) : refused();
      },
      compose: refused,
    };
    session = newSession(refusing);
    session.startDraft({ title: 'Converted Theme', provider: 'Someone' });
    await assign(await chosenPhoto('second.jpg'));
    const beforeFailure = session.current();

    const converted = await session.convertAsset(BACKGROUND, 'cover');

    expect(converted.ok).toBe(false);
    expect(session.current()?.project).toEqual(beforeFailure?.project);
    expect(session.current()?.canUndo).toBe(beforeFailure?.canUndo);
    expect(session.current()?.isDirty).toBe(beforeFailure?.isDirty);
    expect(before).toBeDefined();
  });

  it('refuses a file that is not a picture, without touching the theme', async () => {
    const notAnImage = join(workspace, 'notes.png');
    await writeFile(notAnImage, 'this is a sentence, not a picture');
    const before = session.current();

    const converted = await session.assignAsset(BACKGROUND, notAnImage);

    expect(converted.ok || converted.error.code).toBe('not-an-image');
    expect(session.current()?.revision).toBe(before?.revision);
  });
});

describe('taking a conversion back', () => {
  it('is one step, and puts the original picture back', async () => {
    await assign(await chosenPhoto());
    const assigned = session.current();

    await convert();
    const undone = await session.undo();

    expect(undone?.project.home.pages[0]?.background).toBe('background-1.jpg');
    expect(undone?.project).toEqual(assigned?.project);
    expect(mediaOf(undone!, 'background-1.jpg')).toMatchObject({ format: 'jpeg', width: 1600 });
    expect(undone?.canUndo).toBe(true);
  });

  it('puts the converted picture back when it is redone', async () => {
    await assign(await chosenPhoto());
    await convert();
    await session.undo();

    const redone = await session.redo();

    expect(redone?.project.home.pages[0]?.background).toBe('background-1.png');
    expect(mediaOf(redone!, 'background-1.png')).toMatchObject({ format: 'png', width: 960 });
  });

  it('keeps a conversion apart from whatever replaced it under the same name', async () => {
    // A converted picture and a PNG somebody chose are both called background-1.png inside
    // the theme, so only what stands behind the name can tell one version from another.
    const first = join(workspace, 'first.png');
    await writeFile(first, await pngBytes({ width: 1200, height: 900 }));
    await assign(first);
    await convert();
    const converted = await session.readAsset('background-1.png' as never);

    const second = join(workspace, 'second.png');
    await writeFile(second, await pngBytes({ width: 400, height: 400, gradient: false }));
    await assign(second);
    const replaced = await session.readAsset('background-1.png' as never);
    expect(
      converted?.ok &&
        replaced?.ok &&
        Buffer.from(converted.value).equals(Buffer.from(replaced.value)),
    ).toBe(false);

    await session.undo();
    const back = await session.readAsset('background-1.png' as never);

    expect(
      converted?.ok && back?.ok && Buffer.from(converted.value).equals(Buffer.from(back.value)),
    ).toBe(true);
  });
});

describe('what happens to a converted picture afterwards', () => {
  it('is what the preview is shown', async () => {
    await assign(await chosenPhoto());
    await convert();

    const shown = await session.readAsset('background-1.png' as never);

    expect(shown?.ok).toBe(true);
    expect(shown?.ok === true && identifyMedia(shown.value)).toMatchObject({
      format: 'png',
      width: 960,
      height: 512,
    });
  });

  it('is written into the project, and comes back when it is opened again', async () => {
    await assign(await chosenPhoto());
    await convert();

    const projectPath = join(workspace, 'Converted.vitatheme');
    const saved = await session.saveTo(projectPath, 'Converted');
    expect(saved.ok).toBe(true);
    expect((await readdir(join(workspace, 'Converted.assets'))).sort()).toEqual([
      'background-1.png',
      'background-thumbnail-1.png',
    ]);

    session = newSession();
    const reopened = await session.openProject(projectPath, 'Converted');

    expect(reopened.ok && reopened.value.project.home.pages[0]?.background).toBe(
      'background-1.png',
    );
    expect(reopened.ok && mediaOf(reopened.value, 'background-1.png')).toMatchObject({
      format: 'png',
      width: 960,
      height: 512,
      encoding: { colorModel: 'indexed', bitDepth: 8 },
    });
  });

  it('is what an exported theme contains', async () => {
    await assign(await chosenPhoto());
    await convert();

    const exported = await session.exportTo({
      kind: 'folder',
      path: join(workspace, 'Exported'),
      overwrite: false,
    });

    expect(exported?.status).toBe('exported');
    const written = await readFile(join(workspace, 'Exported', 'background-1.png'));
    expect(identifyMedia(written)).toMatchObject({
      format: 'png',
      width: 960,
      height: 512,
      encoding: { colorModel: 'indexed' },
    });
  });

  it('is in the archive as well', async () => {
    await assign(await chosenPhoto());
    await convert();

    const archivePath = join(workspace, 'Converted.zip');
    await session.exportTo({ kind: 'archive', path: archivePath, overwrite: true });

    const archive = readZipArchive(await readFile(archivePath));
    expect(zipEntryNames(archive)).toEqual([
      'theme.xml',
      'background-1.png',
      'background-thumbnail-1.png',
    ]);
  });

  it('passes the validator that asked for the conversion in the first place', async () => {
    // A PNG of the right size for an icon, with transparency, which the icon slot allows.
    const iconPath = join(workspace, 'icon.png');
    await writeFile(iconPath, await pngBytes({ width: 512, height: 512, transparentDisc: true }));
    await assign(iconPath, { kind: 'appIcon', application: 'browser' });

    const conversion = await convert({ kind: 'appIcon', application: 'browser' });

    const codes = conversion.theme.report.issues.map((issue) => issue.code);
    expect(codes).not.toContain('asset.wrong-dimensions');
    expect(codes).not.toContain('asset.unexpected-transparency');
    expect(conversion.result.media).toMatchObject({
      format: 'png',
      width: 128,
      height: 128,
      encoding: { colorModel: 'truecolor-alpha', hasTransparency: true },
    });
  });
});
