import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThemeSession,
  type ExportDestination,
  type PreviewGeneration,
  type ThemeSession,
} from '@/application/session/theme-session';
import { previewSource } from '@/domain/editing/preview-provenance';
import { errorsIn, warningsIn } from '@/domain/validation/report';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { THEME_PREVIEW_KINDS, type ThemePreviewKind } from '@/domain/vita/theme-previews';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { identifyMedia } from '@/infrastructure/media/media-probe';
import { projectFilePath } from '@/infrastructure/project/project-paths';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { pngBytes } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';
import { assetPath } from '../support/theme-fixtures';
import { readZipArchive, zipEntry, zipEntryNames, zipEntryText } from '../support/zip-reader';

/**
 * Drawing previews, from the editor to the exported theme.
 *
 * The previews are the one part of a theme the application can produce by itself, and this
 * is where that has to hold up as ordinary work: one step to take back, saved with the
 * project, written by the same exporter, checked by the same validator. The other thing
 * proved here is the rule the feature turns on — a picture somebody supplied is never
 * replaced because the application decided to.
 */

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

const PREVIEW_FILES = {
  homePreview: assetPath('preview-home.png'),
  startScreenPreview: assetPath('preview-lock-screen.png'),
  packageThumbnail: assetPath('preview-thumbnail.png'),
} as const satisfies Record<ThemePreviewKind, ThemeAssetPath>;

let workspace: string;
let session: ThemeSession;

const files = fileSystemExternalFiles();

const newSession = (): ThemeSession =>
  createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: files,
    ...sessionAdapters(workspace),
  });

const chosenImage = async (name: string, width: number, height: number): Promise<string> => {
  const path = join(workspace, name);
  await writeFile(path, await pngBytes({ width, height }));
  return path;
};

const withArtwork = async (): Promise<void> => {
  await session.assignAsset(
    { kind: 'liveAreaBackground', page: 0 },
    await chosenImage('wallpaper.png', 960, 512),
  );
  await session.assignAsset(
    { kind: 'startScreenBackground' },
    await chosenImage('lock.png', 960, 512),
  );
  await session.assignAsset(
    { kind: 'appIcon', application: 'settings' },
    await chosenImage('settings.png', 128, 128),
  );
};

const generated = async (kinds: readonly ThemePreviewKind[]): Promise<PreviewGeneration> => {
  const outcome = await session.generatePreviews(kinds);
  if (!outcome.ok) {
    throw new Error(`previews were refused: ${outcome.error.message}`);
  }
  return outcome.value;
};

const exportFolder = async (name: string): Promise<string> => {
  const destination = join(workspace, name);
  const outcome = await session.exportTo({ kind: 'folder', path: destination, overwrite: true });
  expect(outcome?.status).toBe('exported');
  return destination;
};

const exportArchive = async (name: string): Promise<Uint8Array> => {
  const destination = join(workspace, name);
  const outcome = await session.exportTo({ kind: 'archive', path: destination, overwrite: true });
  expect(outcome?.status).toBe('exported');
  return new Uint8Array(await readFile(destination));
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-previews-'));
  session = newSession();
  session.startDraft({ title: 'Drawn Theme', provider: 'Tests' });
  await withArtwork();
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('drawing the previews a theme is browsed by', () => {
  it('draws all three from the theme’s own artwork', async () => {
    const outcome = await generated(THEME_PREVIEW_KINDS);

    expect(outcome.generated.map((preview) => preview.kind)).toEqual([...THEME_PREVIEW_KINDS]);
    expect(outcome.refused).toEqual([]);
  });

  it('gives each one the size the format asks for', async () => {
    const outcome = await generated(THEME_PREVIEW_KINDS);

    for (const preview of outcome.generated) {
      const spec = imageAssetSpec(preview.kind);
      expect(preview.result.media).toMatchObject({
        kind: 'image',
        format: 'png',
        width: spec.width,
        height: spec.height,
        encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: false },
      });
    }
  });

  it('puts each one in its own slot, under the name the slot gives it', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const { metadata } = session.current()?.project ?? { metadata: null };

    expect(metadata?.homePreview).toBe(PREVIEW_FILES.homePreview);
    expect(metadata?.startScreenPreview).toBe(PREVIEW_FILES.startScreenPreview);
    expect(metadata?.packageThumbnail).toBe(PREVIEW_FILES.packageThumbnail);
  });

  it('records them as the application’s own work', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const project = session.current()?.project;

    for (const kind of THEME_PREVIEW_KINDS) {
      expect(project === undefined ? null : previewSource(project, kind)).toBe('generated');
    }
  });

  it('draws a picture the validator finds nothing to say about', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const report = session.current()?.report;

    expect(report === undefined ? null : errorsIn(report)).toEqual([]);
    const aboutPreviews = (report?.issues ?? []).filter((issue) =>
      issue.location.startsWith('metadata.'),
    );
    expect(aboutPreviews).toEqual([]);
  });

  it('makes the project unsaved, because the theme now holds something else', async () => {
    await generated(['homePreview']);

    expect(session.current()?.isDirty).toBe(true);
  });

  it('draws one on its own when only one is asked for', async () => {
    const outcome = await generated(['packageThumbnail']);

    expect(outcome.generated).toHaveLength(1);
    expect(session.current()?.project.metadata.homePreview).toBeNull();
  });
});

describe('the artwork a preview is drawn from', () => {
  const bytesOf = async (path: ThemeAssetPath): Promise<readonly number[]> => {
    const read = await session.readAsset(path);
    if (read?.ok !== true) {
      throw new Error(`"${path}" could not be read back`);
    }
    return [...read.value];
  };

  it('can be a picture this application converted a moment ago', async () => {
    session = newSession();
    session.startDraft({ title: 'Converted Artwork', provider: 'Tests' });
    // A photograph of the wrong shape, made into a wallpaper by the converter.
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await chosenImage('photo.png', 1200, 700),
    );
    const converted = await session.convertAsset({ kind: 'liveAreaBackground', page: 0 }, 'cover');
    expect(converted.ok).toBe(true);

    const outcome = await generated(['homePreview']);

    expect(outcome.generated).toHaveLength(1);
    expect(outcome.refused).toEqual([]);
  });

  it('includes the icons the theme replaces, and only those', async () => {
    const withoutIcons = newSession();
    withoutIcons.startDraft({ title: 'No Icons', provider: 'Tests' });
    await withoutIcons.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      join(workspace, 'wallpaper.png'),
    );
    const drawn = await withoutIcons.generatePreviews(['homePreview']);
    expect(drawn.ok).toBe(true);
    const plain = await withoutIcons.readAsset(PREVIEW_FILES.homePreview);

    // The same wallpaper, in a theme that replaces one icon.
    await generated(['homePreview']);
    const themed = await bytesOf(PREVIEW_FILES.homePreview);

    expect(themed).not.toEqual(plain?.ok === true ? [...plain.value] : null);
  });

  it('draws a home screen for a theme that replaces no icon at all', async () => {
    session = newSession();
    session.startDraft({ title: 'Wallpaper Only', provider: 'Tests' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      join(workspace, 'wallpaper.png'),
    );

    const outcome = await generated(['homePreview']);

    expect(outcome.generated[0]?.result.media).toMatchObject({ width: 480, height: 272 });
  });
});

describe('a preview that cannot be drawn', () => {
  it('says what is missing, and does not stop the others', async () => {
    session = newSession();
    session.startDraft({ title: 'Half a Theme', provider: 'Tests' });
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await chosenImage('only-wallpaper.png', 960, 512),
    );

    const outcome = await generated(THEME_PREVIEW_KINDS);

    expect(outcome.generated.map((preview) => preview.kind)).toEqual([
      'homePreview',
      'packageThumbnail',
    ]);
    expect(outcome.refused).toEqual([
      { kind: 'startScreenPreview', message: expect.stringContaining('lock screen') as string },
    ]);
  });

  it('leaves the theme untouched when none of them can be drawn', async () => {
    session = newSession();
    session.startDraft({ title: 'Nothing Yet', provider: 'Tests' });
    const before = session.current();

    const outcome = await generated(THEME_PREVIEW_KINDS);

    expect(outcome.generated).toEqual([]);
    expect(outcome.refused).toHaveLength(3);
    expect(session.current()?.revision).toBe(before?.revision);
    expect(session.current()?.canUndo).toBe(false);
    expect(session.current()?.isDirty).toBe(false);
  });

  it('refuses when the artwork it would be drawn from cannot be read', async () => {
    const broken = join(workspace, 'broken.png');
    const original = await pngBytes({ width: 960, height: 512 });
    await writeFile(broken, original);
    await session.assignAsset({ kind: 'liveAreaBackground', page: 0 }, broken);
    // The source changed after it was chosen: its header still identifies as PNG, but the
    // pixels are gone when preview generation reads it again.
    await writeFile(
      broken,
      Buffer.concat([Buffer.from(original).subarray(0, 40), Buffer.alloc(64)]),
    );

    const outcome = await generated(['homePreview']);

    expect(outcome.generated).toEqual([]);
    expect(outcome.refused[0]?.message).not.toContain(workspace);
  });

  it('says nothing about where anything is on this machine', async () => {
    session = newSession();
    session.startDraft({ title: 'Nothing Yet', provider: 'Tests' });

    const outcome = await generated(THEME_PREVIEW_KINDS);

    for (const refusal of outcome.refused) {
      expect(refusal.message).not.toContain(workspace);
      expect(refusal.message).not.toContain('/');
    }
  });
});

describe('taking a set of drawn previews back', () => {
  it('is one step, however many were drawn', async () => {
    await generated(THEME_PREVIEW_KINDS);

    await session.undo();

    const project = session.current()?.project;
    expect(project?.metadata.homePreview).toBeNull();
    expect(project?.metadata.startScreenPreview).toBeNull();
    expect(project?.metadata.packageThumbnail).toBeNull();
    // One step, not three: the change before it is still the change before it.
    expect(project?.home.appIcons.get('settings')).toBe('icon-settings.png');
  });

  it('puts them back, and forgets they were the application’s work when they go', async () => {
    await generated(THEME_PREVIEW_KINDS);
    await session.undo();

    expect(session.current()?.project.metadata.generatedPreviews.size).toBe(0);

    await session.redo();
    const project = session.current()?.project;

    expect(project?.metadata.homePreview).toBe(PREVIEW_FILES.homePreview);
    expect(project === undefined ? null : previewSource(project, 'homePreview')).toBe('generated');
  });

  it('puts back exactly the picture that was there before it was drawn again', async () => {
    await generated(['packageThumbnail']);
    const first = await session.readAsset(PREVIEW_FILES.packageThumbnail);

    // Different artwork, so the second thumbnail is a different picture under the same name.
    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await chosenImage('other.png', 800, 600),
    );
    await generated(['packageThumbnail']);
    const second = await session.readAsset(PREVIEW_FILES.packageThumbnail);
    expect(second?.ok === true && first?.ok === true && [...second.value]).not.toEqual(
      first?.ok === true ? [...first.value] : null,
    );

    await session.undo();
    const restored = await session.readAsset(PREVIEW_FILES.packageThumbnail);

    expect(restored?.ok === true ? [...restored.value] : null).toEqual(
      first?.ok === true ? [...first.value] : null,
    );
  });
});

describe('a preview somebody supplied', () => {
  const chooseThumbnail = async (): Promise<void> => {
    await session.assignAsset(
      { kind: 'packageThumbnail' },
      await chosenImage('mine.png', 226, 128),
    );
  };

  it('is the author’s from the moment they choose it', async () => {
    await generated(['packageThumbnail']);
    await chooseThumbnail();
    const project = session.current()?.project;

    expect(project === undefined ? null : previewSource(project, 'packageThumbnail')).toBe(
      'custom',
    );
  });

  it('is not touched when the theme’s artwork changes', async () => {
    await chooseThumbnail();
    const before = await session.readAsset(PREVIEW_FILES.packageThumbnail);

    await session.assignAsset(
      { kind: 'liveAreaBackground', page: 0 },
      await chosenImage('changed.png', 960, 512),
    );
    const after = await session.readAsset(PREVIEW_FILES.packageThumbnail);

    expect(after?.ok === true ? [...after.value] : null).toEqual(
      before?.ok === true ? [...before.value] : null,
    );
  });

  it('is redrawn only when somebody asks for that slot', async () => {
    await chooseThumbnail();
    const before = await session.readAsset(PREVIEW_FILES.packageThumbnail);

    await generated(['packageThumbnail']);
    const after = await session.readAsset(PREVIEW_FILES.packageThumbnail);

    expect(after?.ok === true ? [...after.value] : null).not.toEqual(
      before?.ok === true ? [...before.value] : null,
    );
    const project = session.current()?.project;
    expect(project === undefined ? null : previewSource(project, 'packageThumbnail')).toBe(
      'generated',
    );
  });
});

describe('what happens to a drawn preview afterwards', () => {
  it('is written into the project, and comes back when it is opened again', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const before = await session.readAsset(PREVIEW_FILES.homePreview);

    const saved = await session.saveTo(projectFilePath(join(workspace, 'drawn')), 'Drawn Theme');
    expect(saved.ok).toBe(true);
    await session.close();

    session = newSession();
    const reopened = await session.openProject(
      projectFilePath(join(workspace, 'drawn')),
      'Drawn Theme',
    );
    expect(reopened.ok).toBe(true);

    const project = session.current()?.project;
    expect(project?.metadata.homePreview).toBe(PREVIEW_FILES.homePreview);
    // Still the application's own work, so asking again will not ask anybody anything.
    for (const kind of THEME_PREVIEW_KINDS) {
      expect(project === undefined ? null : previewSource(project, kind)).toBe('generated');
    }

    const after = await session.readAsset(PREVIEW_FILES.homePreview);
    expect(after?.ok === true ? [...after.value] : null).toEqual(
      before?.ok === true ? [...before.value] : null,
    );
  });

  it('is what an exported theme contains, written by the ordinary exporter', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const folder = await exportFolder('exported');

    const written = await readdir(folder);
    for (const name of Object.values(PREVIEW_FILES)) {
      expect(written).toContain(name);
    }

    const bytes = new Uint8Array(await readFile(join(folder, PREVIEW_FILES.homePreview)));
    expect(identifyMedia(bytes)).toMatchObject({
      kind: 'image',
      format: 'png',
      width: 480,
      height: 272,
      encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: false },
    });
  });

  it('is named by the manifest, under the elements the console reads', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const folder = await exportFolder('exported');
    const manifest = await readFile(join(folder, 'theme.xml'), 'utf-8');

    expect(manifest).toContain(
      `<m_homePreviewFilePath>${PREVIEW_FILES.homePreview}</m_homePreviewFilePath>`,
    );
    expect(manifest).toContain(
      `<m_startPreviewFilePath>${PREVIEW_FILES.startScreenPreview}</m_startPreviewFilePath>`,
    );
    expect(manifest).toContain(
      `<m_packageImageFilePath>${PREVIEW_FILES.packageThumbnail}</m_packageImageFilePath>`,
    );
  });

  it('is in the archive as well, at its root', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const archive = readZipArchive(await exportArchive('drawn.zip'));

    for (const name of Object.values(PREVIEW_FILES)) {
      expect(zipEntryNames(archive)).toContain(name);
      expect(zipEntry(archive, name).contents.byteLength).toBeGreaterThan(0);
    }
    expect(zipEntryText(archive, 'theme.xml')).toContain(PREVIEW_FILES.homePreview);
  });

  it('is read back as a theme the validator accepts', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const folder = await exportFolder('exported');

    session = newSession();
    const reopened = await session.openFolder(folder, 'Drawn Theme');
    expect(reopened.ok).toBe(true);

    const report = session.current()?.report;
    expect(report === undefined ? null : errorsIn(report)).toEqual([]);
    expect(
      (report === undefined ? [] : warningsIn(report)).filter((issue) =>
        issue.location.startsWith('metadata.'),
      ),
    ).toEqual([]);
  });

  it('is the author’s own once it has been through an export and back', async () => {
    await generated(THEME_PREVIEW_KINDS);
    const folder = await exportFolder('exported');

    session = newSession();
    await session.openFolder(folder, 'Drawn Theme');
    const project = session.current()?.project;

    // A theme folder is somebody else's work; `theme.xml` cannot say a tool drew a picture.
    expect(project === undefined ? null : previewSource(project, 'homePreview')).toBe('custom');
  });
});

describe('asking with no theme open', () => {
  it('is refused, and says so', async () => {
    await session.close();

    const outcome = await session.generatePreviews(['homePreview']);

    expect(outcome.ok || outcome.error.code).toBe('no-theme-open');
  });
});
