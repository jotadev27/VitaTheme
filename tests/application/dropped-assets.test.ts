import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThemeSession,
  type ExportDestination,
  type ThemeSession,
} from '@/application/session/theme-session';
import { MAX_THEME_ASSET_BYTES } from '@/application/ports/theme-assets';
import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { jpegBytes, pngBytes } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';

/**
 * A file that arrived by being dragged onto the application.
 *
 * Dropping is not a second way of putting artwork into a theme: the path a drop produces goes
 * to the same place a path from a dialog goes, and everything below is what that means in
 * practice. The awkward cases are here — a folder, a link out of the way, a file pretending
 * to be something else — because a drop is the one gesture the window starts, and a page that
 * had been made to misbehave would start it with something unpleasant.
 */

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

const BACKGROUND: ThemeAssetSlot = { kind: 'liveAreaBackground', page: 0 };

let workspace: string;
let session: ThemeSession;

/** Exactly what the privileged side does with a dropped file, and nothing more. */
const drop = (path: string, slot: ThemeAssetSlot = BACKGROUND) => session.assignAsset(slot, path);

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-drop-'));
  session = createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: fileSystemExternalFiles(),
    ...sessionAdapters(workspace),
  });
  session.startDraft({ title: 'Dropped Theme', provider: 'Someone' });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('a picture dropped onto a slot', () => {
  it('goes in, named after the slot rather than after the file', async () => {
    const path = join(workspace, 'a photograph somebody took.png');
    await writeFile(path, await pngBytes({ width: 960, height: 512 }));

    const dropped = await drop(path);

    expect(dropped.ok && dropped.value.project.home.pages[0]?.background).toBe('background-1.png');
    expect(dropped.ok && dropped.value.project.home.pages[0]?.thumbnail).toBe(
      'background-thumbnail-1.png',
    );
    expect(dropped.ok && dropped.value.project.home.pages[0]?.generatedThumbnail).toBe(true);
    expect(dropped.ok && dropped.value.assets[0]?.lookup.status).toBe('found');
  });

  it('is identified by its bytes, whatever the file is called', async () => {
    const path = join(workspace, 'actually-a-jpeg.png');
    await writeFile(path, await jpegBytes({ width: 800, height: 600 }));

    const dropped = await drop(path);

    // Named for what it turned out to be, so the theme never claims a JPEG is a PNG.
    expect(dropped.ok && dropped.value.project.home.pages[0]?.background).toBe('background-1.jpg');
  });

  it('can be music, for the slot that takes music', async () => {
    const path = join(workspace, 'not-really-audio.at9');
    await writeFile(path, new Uint8Array(64));

    const dropped = await drop(path, { kind: 'backgroundMusic' });

    // Accepted as a file and reported for what it is; the validator has the last word.
    expect(dropped.ok).toBe(true);
    expect(dropped.ok && dropped.value.project.home.backgroundMusic).toBe('music.bin');
  });

  it('makes one step to take back, exactly like choosing a file does', async () => {
    const first = join(workspace, 'first.png');
    const second = join(workspace, 'second.png');
    await writeFile(first, await pngBytes({ width: 960, height: 512 }));
    await writeFile(second, await pngBytes({ width: 640, height: 480 }));

    await drop(first);
    const afterFirst = session.current();
    await drop(second);

    const undone = await session.undo();

    expect(undone?.project).toEqual(afterFirst?.project);
    expect(undone?.isDirty).toBe(true);
    expect((await session.redo())?.assets[0]?.lookup.status).toBe('found');
  });

  it('is saved into the project and exported like any other artwork', async () => {
    const path = join(workspace, 'dropped.png');
    await writeFile(path, await pngBytes({ width: 960, height: 512 }));
    await drop(path);

    const saved = await session.saveTo(join(workspace, 'Dropped.vitatheme'), 'Dropped');
    const exported = await session.exportTo({
      kind: 'folder',
      path: join(workspace, 'Exported'),
      overwrite: false,
    });

    expect(saved.ok).toBe(true);
    expect(exported?.status).toBe('exported');
  });

  it('never modifies the file that was dropped', async () => {
    const path = join(workspace, 'original.png');
    const bytes = await pngBytes({ width: 300, height: 300 });
    await writeFile(path, bytes);

    await drop(path);
    await session.saveTo(join(workspace, 'Dropped.vitatheme'), 'Dropped');
    await session.exportTo({ kind: 'folder', path: join(workspace, 'Exported'), overwrite: false });

    const { readFile } = await import('node:fs/promises');
    expect((await readFile(path)).equals(Buffer.from(bytes))).toBe(true);
  });
});

describe('a drop that should not be honoured', () => {
  it('refuses a folder', async () => {
    const folder = join(workspace, 'a folder');
    await mkdir(folder);

    const dropped = await drop(folder);

    expect(dropped.ok || dropped.error.code).toBe('not-a-file');
  });

  it('refuses a link that leads to a folder', async () => {
    const folder = join(workspace, 'somewhere');
    await mkdir(folder);
    const link = join(workspace, 'looks-like-a-file.png');
    await symlink(folder, link);

    const dropped = await drop(link);

    expect(dropped.ok || dropped.error.code).toBe('not-a-file');
  });

  it('refuses a file that is not there, however plausible the path looks', async () => {
    const dropped = await drop(join(workspace, 'never-existed.png'));

    expect(dropped.ok || dropped.error.code).toBe('missing');
  });

  it('refuses a path that climbs out of anywhere, because it resolves to nothing', async () => {
    const dropped = await drop(join(workspace, '..', '..', '..', 'etc', 'shadow'));

    expect(dropped.ok).toBe(false);
  });

  it('refuses a file larger than a theme can hold', async () => {
    const huge = join(workspace, 'huge.png');
    await writeFile(huge, Buffer.alloc(MAX_THEME_ASSET_BYTES + 1024));

    const dropped = await drop(huge);

    expect(dropped.ok || dropped.error.code).toBe('too-large');
  });

  it('leaves the theme untouched when a drop is refused', async () => {
    const before = session.current();

    await drop(join(workspace, 'nothing-here.png'));

    expect(session.current()?.project).toEqual(before?.project);
    expect(session.current()?.canUndo).toBe(false);
    expect(session.current()?.isDirty).toBe(false);
  });

  it('says nothing about where anything is when it refuses', async () => {
    const folder = join(workspace, 'a folder');
    await mkdir(folder);

    const dropped = await drop(folder);

    expect(dropped.ok || dropped.error.message).not.toContain(workspace);
    expect(dropped.ok || dropped.error.message).not.toContain(tmpdir());
  });
});
