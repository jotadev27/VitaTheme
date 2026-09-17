import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Jimp } from 'jimp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThemeSession,
  type ExportDestination,
  type ThemeSession,
} from '@/application/session/theme-session';
import { pageThumbnailSource } from '@/domain/editing/page-thumbnail-provenance';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { identifyMedia } from '@/infrastructure/media/media-probe';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { MINIMAL_MANIFEST } from '../support/manifest-fixtures';
import { pngBytes, pixelsOf } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';
import { writeThemeFolder } from '../support/theme-folder-fixtures';
import { readZipArchive, zipEntry, zipEntryNames } from '../support/zip-reader';

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };
  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

let workspace: string;
let session: ThemeSession;

const newSession = (): ThemeSession =>
  createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: fileSystemExternalFiles(),
    ...sessionAdapters(workspace),
  });

const chosen = async (name: string, width = 600, height = 400, gradient = false) => {
  const path = join(workspace, name);
  await writeFile(path, await pngBytes({ width, height, gradient }));
  return path;
};

const assigned = async (kind: 'liveAreaBackground' | 'liveAreaThumbnail', path: string) => {
  const result = await session.assignAsset({ kind, page: 0 }, path);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const thumbnailBytes = async (): Promise<Uint8Array> => {
  const path = session.current()?.project.home.pages[0]?.thumbnail;
  if (path === undefined || path === null) throw new Error('No page thumbnail');
  const read = await session.readAsset(path);
  if (!read?.ok) throw new Error('The page thumbnail could not be read');
  return read.value;
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-page-thumbnail-'));
  session = newSession();
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('page thumbnail workflow', () => {
  it('generates a canonical, deterministic proportional crop with the new background', async () => {
    session.startDraft({ title: 'Circles', provider: 'Tests' });
    const source = new Jimp({ width: 400, height: 400, color: 0x000000ff });
    for (let y = 0; y < 400; y += 1) {
      for (let x = 0; x < 400; x += 1) {
        if ((x - 200) ** 2 + (y - 200) ** 2 <= 80 ** 2) {
          const at = (y * 400 + x) * 4;
          source.bitmap.data[at] = 255;
          source.bitmap.data[at + 1] = 255;
          source.bitmap.data[at + 2] = 255;
        }
      }
    }
    const input = join(workspace, 'circle.png');
    await writeFile(input, await source.getBuffer('image/png'));

    const theme = await assigned('liveAreaBackground', input);
    const page = theme.project.home.pages[0]!;
    expect(page.background).toBe('background-1.png');
    expect(page.thumbnail).toBe('background-thumbnail-1.png');
    expect(pageThumbnailSource(theme.project, 0)).toBe('generated');
    expect(theme.assets.map((asset) => asset.path)).toEqual([
      'background-1.png',
      'background-thumbnail-1.png',
    ]);
    const first = await thumbnailBytes();
    const media = identifyMedia(first);
    const spec = imageAssetSpec('liveAreaThumbnail');
    expect(media).toMatchObject({ format: 'png', width: spec.width, height: spec.height });
    expect(
      theme.report.issues
        .filter((issue) => issue.location.endsWith('.thumbnail'))
        .map((issue) => issue.code),
    ).not.toContain('asset.wrong-dimensions');

    const pixels = await pixelsOf(first);
    const whiteAt = (x: number, y: number) => (pixels.at(x, y)[0] ?? 0) > 180;
    const horizontal = Array.from({ length: pixels.width }, (_, x) => x).filter((x) =>
      whiteAt(x, 96),
    );
    const vertical = Array.from({ length: pixels.height }, (_, y) => y).filter((y) =>
      whiteAt(180, y),
    );
    // A circle remains a circle after a centred cover crop. Stretching would halve its height.
    expect(Math.abs(horizontal.length - vertical.length)).toBeLessThan(4);
    expect(horizontal.length).toBeGreaterThan(135);

    const regenerated = await session.generatePageThumbnail(0);
    expect(regenerated.ok).toBe(true);
    expect(await thumbnailBytes()).toEqual(first);
  });

  it('regenerates a generated thumbnail on replacement, and undo/redo restore both exact assets', async () => {
    session.startDraft({ title: 'History', provider: 'Tests' });
    const firstTheme = await assigned('liveAreaBackground', await chosen('first.png'));
    const firstThumb = await thumbnailBytes();
    const firstBackground = await session.readAsset(firstTheme.project.home.pages[0]!.background!);

    const secondTheme = await assigned(
      'liveAreaBackground',
      await chosen('second.png', 600, 400, true),
    );
    const secondThumb = await thumbnailBytes();
    const secondBackground = await session.readAsset(
      secondTheme.project.home.pages[0]!.background!,
    );
    expect(secondThumb).not.toEqual(firstThumb);

    const undone = await session.undo();
    expect(undone?.project.home.pages[0]?.generatedThumbnail).toBe(true);
    expect(await thumbnailBytes()).toEqual(firstThumb);
    expect(await session.readAsset(undone!.project.home.pages[0]!.background!)).toEqual(
      firstBackground,
    );

    const redone = await session.redo();
    expect(redone?.project.home.pages[0]?.generatedThumbnail).toBe(true);
    expect(await thumbnailBytes()).toEqual(secondThumb);
    expect(await session.readAsset(redone!.project.home.pages[0]!.background!)).toEqual(
      secondBackground,
    );
  });

  it('keeps a manually replaced thumbnail custom through background and bulk changes', async () => {
    session.startDraft({ title: 'Custom', provider: 'Tests' });
    await assigned('liveAreaBackground', await chosen('first.jpg', 600, 400, true));
    const originalGenerated = await thumbnailBytes();
    const custom = await assigned('liveAreaThumbnail', await chosen('custom.png', 400, 400, true));
    expect(pageThumbnailSource(custom.project, 0)).toBe('custom');
    const exactCustom = await thumbnailBytes();
    expect(pageThumbnailSource((await session.undo())!.project, 0)).toBe('generated');
    expect(await thumbnailBytes()).toEqual(originalGenerated);
    expect(pageThumbnailSource((await session.redo())!.project, 0)).toBe('custom');
    expect(await thumbnailBytes()).toEqual(exactCustom);

    const projectPath = join(workspace, 'Custom.vitatheme');
    expect((await session.saveTo(projectPath, 'Custom')).ok).toBe(true);
    session = newSession();
    const reopened = await session.openProject(projectPath, 'Custom');
    expect(reopened.ok).toBe(true);
    expect(pageThumbnailSource(session.current()!.project, 0)).toBe('custom');
    expect(await thumbnailBytes()).toEqual(exactCustom);

    await assigned('liveAreaBackground', await chosen('second.png', 500, 300));
    expect(await thumbnailBytes()).toEqual(exactCustom);
    expect(pageThumbnailSource(session.current()!.project, 0)).toBe('custom');
    const bulk = await session.convertIncompatibleImages('contain');
    expect(bulk.ok).toBe(true);
    expect(await thumbnailBytes()).toEqual(exactCustom);
    expect(pageThumbnailSource(session.current()!.project, 0)).toBe('custom');

    const regenerated = await session.generatePageThumbnail(0);
    expect(regenerated.ok).toBe(true);
    expect(pageThumbnailSource(session.current()!.project, 0)).toBe('generated');
    const newGenerated = await thumbnailBytes();
    expect(newGenerated).not.toEqual(exactCustom);
    expect(pageThumbnailSource((await session.undo())!.project, 0)).toBe('custom');
    expect(await thumbnailBytes()).toEqual(exactCustom);
    expect(pageThumbnailSource((await session.redo())!.project, 0)).toBe('generated');
    expect(await thumbnailBytes()).toEqual(newGenerated);
  });

  it('keeps a generated thumbnail in sync when bulk conversion changes its background', async () => {
    session.startDraft({ title: 'Bulk', provider: 'Tests' });
    const photo = join(workspace, 'photo.jpg');
    // PNG bytes are identified by content, and retain their extension from that identification.
    await writeFile(photo, await pngBytes({ width: 500, height: 500, gradient: true }));
    await assigned('liveAreaBackground', photo);
    const before = await thumbnailBytes();

    const converted = await session.convertIncompatibleImages('contain');
    expect(converted.ok).toBe(true);
    expect(pageThumbnailSource(session.current()!.project, 0)).toBe('generated');
    expect(await thumbnailBytes()).not.toEqual(before);
    const undone = await session.undo();
    expect(undone?.project.home.pages[0]?.background).toBe('background-1.png');
    expect(await thumbnailBytes()).toEqual(before);
  });

  it('persists provenance and writes separate assets to a folder and ZIP', async () => {
    session.startDraft({ title: 'Portable', provider: 'Tests' });
    await assigned('liveAreaBackground', await chosen('wallpaper.png', 960, 512));
    const generated = await thumbnailBytes();
    const projectPath = join(workspace, 'Portable.vitatheme');
    expect((await session.saveTo(projectPath, 'Portable')).ok).toBe(true);

    session = newSession();
    const reopened = await session.openProject(projectPath, 'Portable');
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(pageThumbnailSource(reopened.value.project, 0)).toBe('generated');
    expect(await thumbnailBytes()).toEqual(generated);

    const folder = join(workspace, 'Exported');
    expect(
      (await session.exportTo({ kind: 'folder', path: folder, overwrite: false }))?.status,
    ).toBe('exported');
    expect((await readdir(folder)).sort()).toEqual([
      'background-1.png',
      'background-thumbnail-1.png',
      'theme.xml',
    ]);
    expect(new Uint8Array(await readFile(join(folder, 'background-thumbnail-1.png')))).toEqual(
      generated,
    );

    const archivePath = join(workspace, 'Exported.zip');
    expect(
      (await session.exportTo({ kind: 'archive', path: archivePath, overwrite: false }))?.status,
    ).toBe('exported');
    const archive = readZipArchive(await readFile(archivePath));
    expect(zipEntryNames(archive)).toContain('background-thumbnail-1.png');
    expect(zipEntry(archive, 'background-thumbnail-1.png').contents).toEqual(generated);
  });

  it('opens an existing thumbnail as custom and offers generation only for a missing one', async () => {
    const existingFolder = join(workspace, 'Existing');
    const withCustomThumbnail = MINIMAL_MANIFEST.replace(
      '<m_imageFilePath>bg1.png</m_imageFilePath>',
      '<m_imageFilePath>bg1.png</m_imageFilePath><m_thumbnailFilePath>bg1t.png</m_thumbnailFilePath>',
    );
    await writeThemeFolder(existingFolder, withCustomThumbnail);
    await writeFile(join(existingFolder, 'bg1.png'), await pngBytes({ width: 960, height: 512 }));
    await writeFile(join(existingFolder, 'bg1t.png'), await pngBytes({ width: 400, height: 400 }));
    const existingBytes = await readFile(join(existingFolder, 'bg1t.png'));
    const opened = await session.openFolder(existingFolder, 'Existing');
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.isDirty).toBe(false);
    expect(pageThumbnailSource(opened.value.project, 0)).toBe('custom');
    expect(await session.readAsset(opened.value.project.home.pages[0]!.thumbnail!)).toEqual({
      ok: true,
      value: new Uint8Array(existingBytes),
    });
    expect(await readFile(join(existingFolder, 'bg1t.png'))).toEqual(existingBytes);
    const bulk = await session.convertIncompatibleImages('cover');
    expect(bulk.ok).toBe(true);
    expect(pageThumbnailSource(session.current()!.project, 0)).toBe('custom');
    expect(await session.readAsset(opened.value.project.home.pages[0]!.thumbnail!)).toEqual({
      ok: true,
      value: new Uint8Array(existingBytes),
    });

    const missingFolder = join(workspace, 'Missing');
    await writeThemeFolder(missingFolder, MINIMAL_MANIFEST);
    await writeFile(
      join(missingFolder, 'bg1.png'),
      await pngBytes({ width: 960, height: 512, gradient: false }),
    );
    const originalFiles = (await readdir(missingFolder)).sort();
    const missing = await session.openFolder(missingFolder, 'Missing');
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    expect(missing.value.isDirty).toBe(false);
    expect(pageThumbnailSource(missing.value.project, 0)).toBe('missing');
    expect((await readdir(missingFolder)).sort()).toEqual(originalFiles);

    const generated = await session.generatePageThumbnail(0);
    expect(generated.ok).toBe(true);
    expect(pageThumbnailSource(session.current()!.project, 0)).toBe('generated');
    expect((await readdir(missingFolder)).sort()).toEqual(originalFiles);
  });
});
