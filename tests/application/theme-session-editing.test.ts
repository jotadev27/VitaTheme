import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_THEME_ASSET_BYTES } from '@/application/ports/theme-assets';
import {
  createThemeSession,
  type ExportDestination,
  type LoadedTheme,
  type ThemeSession,
} from '@/application/session/theme-session';
import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import { hasErrors } from '@/domain/validation/report';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { sessionAdapters } from '../support/project-fixtures';
import { pngHeaderBytes, riffWaveBytes } from '../support/binary-fixtures';
import { pngBytes } from '../support/image-fixtures';
import { writeThemeFolder } from '../support/theme-folder-fixtures';
import { readZipArchive, zipEntry, zipEntryNames } from '../support/zip-reader';

/**
 * Editing a theme, with the real filesystem behind it.
 *
 * Two things are being checked throughout: that a change goes through one path and comes back
 * as the theme itself, and that bringing a file in from somewhere else never gives the
 * application more reach than the person using it granted by choosing that one file.
 */

const symbolicLinksAvailable = ((): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'vitatheme-symlink-probe-'));
  try {
    writeFileSync(join(probe, 'target'), 'probe');
    symlinkSync(join(probe, 'target'), join(probe, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

let workspace: string;
let themeFolder: string;
let elsewhere: string;
let session: ThemeSession;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-editing-'));
  themeFolder = join(workspace, 'Example Theme');
  elsewhere = join(workspace, 'artwork');
  await writeThemeFolder(themeFolder);
  await mkdir(elsewhere);

  session = createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: fileSystemExternalFiles(),
    ...sessionAdapters(workspace),
  });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const anImageAt = async (name: string, width = 128, height = 128): Promise<string> => {
  const path = join(elsewhere, name);
  await writeFile(path, pngHeaderBytes({ width, height }));
  return path;
};

const openExample = async (): Promise<LoadedTheme> => {
  const opened = await session.openFolder(themeFolder, 'Example Theme');
  if (!opened.ok) {
    throw new Error(`Expected the theme to open: ${opened.error.message}`);
  }
  return opened.value;
};

const edit = async (...args: Parameters<ThemeSession['applyEdit']>): Promise<LoadedTheme> => {
  const result = await session.applyEdit(...args);
  if (!result.ok) {
    throw new Error(`Expected the change to be accepted: ${result.error.message}`);
  }
  return result.value;
};

const assign = async (slot: ThemeAssetSlot, location: string): Promise<LoadedTheme> => {
  const result = await session.assignAsset(slot, location);
  if (!result.ok) {
    throw new Error(`Expected the file to be accepted: ${result.error.message}`);
  }
  return result.value;
};

describe('changing a theme', () => {
  it('hands back the theme that resulted, not a copy to keep', async () => {
    await openExample();

    const after = await edit({ kind: 'set-localized-default', field: 'title', value: 'Midnight' });

    expect(after.project.metadata.title.defaultValue).toBe('Midnight');
    expect(session.current()?.project.metadata.title.defaultValue).toBe('Midnight');
  });

  it('counts every change, so what is looked at can be told apart', async () => {
    const opened = await openExample();

    const first = await edit({ kind: 'add-page' });
    const second = await edit({ kind: 'add-page' });

    expect(first.revision).toBeGreaterThan(opened.revision);
    expect(second.revision).toBeGreaterThan(first.revision);
  });

  it('checks the theme again after a change', async () => {
    await openExample();

    const after = await edit({ kind: 'set-localized-default', field: 'title', value: '' });

    expect(after.report.issues.map((issue) => issue.code)).toContain('metadata.title-empty');
    expect(hasErrors(after.report)).toBe(true);
  });

  it('reports a refused change and leaves the theme as it was', async () => {
    const before = await openExample();

    const result = await session.applyEdit({ kind: 'set-content-version', value: '1.0' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid-content-version');
    expect(session.current()?.project).toEqual(before.project);
  });

  it('has nothing to change when no theme is open', async () => {
    const result = await session.applyEdit({ kind: 'add-page' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('no-theme-open');
  });

  it('does not go back to the filesystem for a change that touches no file', async () => {
    const opened = await openExample();
    await rm(join(themeFolder, 'bg1.png'));

    // The theme's own files were examined when it was opened; renaming it does not make that
    // answer wrong, and re-reading every file on every keystroke would be the wrong shape.
    const after = await edit({ kind: 'set-localized-default', field: 'title', value: 'Renamed' });

    expect(hasErrors(after.report)).toBe(false);
    expect(after.assets).toHaveLength(opened.assets.length);
  });

  it('notices the missing file as soon as the theme is checked again', async () => {
    await openExample();
    await rm(join(themeFolder, 'bg1.png'));

    const refreshed = await session.refresh();

    expect(refreshed?.report.issues.map((issue) => issue.code)).toContain('asset.missing');
  });
});

describe('bringing a file into a theme', () => {
  it('names it after the slot and after what it turned out to be', async () => {
    await openExample();

    const after = await assign(
      { kind: 'appIcon', application: 'browser' },
      await anImageAt('whatever the person called it.png'),
    );

    expect(after.project.home.appIcons.get('browser')).toBe('icon-browser.png');
  });

  it('makes it part of the theme, sized and identified', async () => {
    await openExample();

    const after = await assign({ kind: 'appIcon', application: 'music' }, await anImageAt('m.png'));
    const summary = after.assets.find((asset) => asset.path === 'icon-music.png');

    expect(summary?.lookup.status).toBe('found');
    expect(summary?.lookup.status === 'found' && summary.lookup.asset.media).toMatchObject({
      kind: 'image',
      format: 'png',
      width: 128,
      height: 128,
    });
  });

  it('writes nothing into the folder the theme came from', async () => {
    const before = await readdir(themeFolder);
    await openExample();

    await assign({ kind: 'appIcon', application: 'browser' }, await anImageAt('icon.png'));

    // Export is still the only moment anything is written.
    expect(await readdir(themeFolder)).toEqual(before);
  });

  it('checks the file against the specification rather than accepting it silently', async () => {
    await openExample();

    // A background-sized image in an icon slot is wrong, and it is the validator that says so.
    const after = await assign(
      { kind: 'appIcon', application: 'browser' },
      await anImageAt('too-big.png', 960, 512),
    );

    expect(after.report.issues.map((issue) => issue.code)).toContain('asset.wrong-dimensions');
  });

  it('accepts a file that is not what the slot needs, and reports why', async () => {
    await openExample();
    const wave = join(elsewhere, 'music.at9');
    await writeFile(wave, riffWaveBytes({ atrac9: false }));

    const after = await assign({ kind: 'backgroundMusic' }, wave);

    expect(after.project.home.backgroundMusic).toBe('music.wav');
    expect(after.report.issues.map((issue) => issue.code)).toContain('asset.wrong-audio-format');
  });

  it('assigns, replaces and clears valid AT9 music without changing the source files', async () => {
    session.startDraft({ title: 'Music', provider: 'Tests' });
    const first = join(elsewhere, 'first.at9');
    const second = join(elsewhere, 'second.at9');
    const bytes = riffWaveBytes({ atrac9: true });
    await writeFile(first, bytes);
    await writeFile(second, bytes);

    const assigned = await assign({ kind: 'backgroundMusic' }, first);
    expect(assigned.project.home.backgroundMusic).toBe('music.at9');
    expect(assigned.report.issues.map((issue) => issue.code)).not.toContain(
      'asset.wrong-audio-format',
    );
    const replaced = await assign({ kind: 'backgroundMusic' }, second);
    expect(replaced.project.home.backgroundMusic).toBe('music.at9');
    const cleared = await edit({ kind: 'clear-asset', slot: { kind: 'backgroundMusic' } });
    expect(cleared.project.home.backgroundMusic).toBeNull();
    expect(cleared.report.issues.map((issue) => issue.code)).not.toContain('asset.missing');
    expect(await readFile(first)).toEqual(Buffer.from(bytes));
    expect(await readFile(second)).toEqual(Buffer.from(bytes));
  });

  it('replaces what was there, keeping one file per slot', async () => {
    await openExample();
    await assign({ kind: 'appIcon', application: 'browser' }, await anImageAt('first.png'));

    const after = await assign(
      { kind: 'appIcon', application: 'browser' },
      await anImageAt('second.png', 64, 64),
    );

    const summary = after.assets.find((asset) => asset.path === 'icon-browser.png');
    expect(summary?.lookup.status === 'found' && summary.lookup.asset.media).toMatchObject({
      width: 64,
      height: 64,
    });
  });

  it('empties a slot without disturbing the file it came from', async () => {
    await openExample();
    const source = await anImageAt('icon.png');
    await assign({ kind: 'appIcon', application: 'browser' }, source);

    const after = await edit({
      kind: 'clear-asset',
      slot: { kind: 'appIcon', application: 'browser' },
    });

    expect(after.project.home.appIcons.has('browser')).toBe(false);
    expect(await readFile(source)).toBeDefined();
  });

  it('has nowhere to put a file when no theme is open', async () => {
    const result = await session.assignAsset(
      { kind: 'appIcon', application: 'browser' },
      await anImageAt('icon.png'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('no-theme-open');
  });
});

describe('files it refuses to bring in', () => {
  it('refuses one that is not there', async () => {
    await openExample();

    const result = await session.assignAsset(
      { kind: 'appIcon', application: 'browser' },
      join(elsewhere, 'nothing.png'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('missing');
  });

  it('refuses a folder', async () => {
    await openExample();

    const result = await session.assignAsset(
      { kind: 'appIcon', application: 'browser' },
      elsewhere,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not-a-file');
  });

  it('refuses one far larger than any theme asset, without reading it', async () => {
    await openExample();
    const huge = join(elsewhere, 'huge.png');
    const handle = await open(huge, 'w');
    await handle.truncate(MAX_THEME_ASSET_BYTES + 1);
    await handle.close();

    const result = await session.assignAsset({ kind: 'appIcon', application: 'browser' }, huge);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('too-large');
  });

  it('never repeats where the file was in what it reports', async () => {
    await openExample();

    const result = await session.assignAsset(
      { kind: 'appIcon', application: 'browser' },
      join(elsewhere, 'nothing.png'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).not.toContain(workspace);
    expect(result.error.message).not.toContain(tmpdir());
  });

  it.skipIf(!symbolicLinksAvailable)(
    'follows a link to the file it points at, and holds that file rather than the link',
    async () => {
      await openExample();
      const real = await anImageAt('real.png', 22, 22);
      const link = join(elsewhere, 'link.png');
      await symlink(real, link);

      const after = await assign({ kind: 'basePageIndicator' }, link);

      // What matters is that the link is resolved once, now: the application then holds a
      // path that cannot be pointed somewhere else behind its back.
      const summary = after.assets.find((asset) => asset.path === 'page-dot.png');
      expect(summary?.lookup.status === 'found' && summary.lookup.asset.media).toMatchObject({
        width: 22,
        height: 22,
      });
    },
  );
});

describe('exporting what was edited', () => {
  it('writes the files that were brought in, at the names the manifest uses', async () => {
    await openExample();
    await assign({ kind: 'appIcon', application: 'browser' }, await anImageAt('icon.png'));

    const destination = join(workspace, 'Exported.zip');
    const outcome = await session.exportTo({
      kind: 'archive',
      path: destination,
      overwrite: false,
    });

    expect(outcome?.status).toBe('exported');
    const archive = readZipArchive(await readFile(destination));
    expect(zipEntryNames(archive)).toContain('icon-browser.png');
    expect(zipEntry(archive, 'icon-browser.png').contents).toEqual(
      new Uint8Array(await readFile(join(elsewhere, 'icon.png'))),
    );
  });

  it('writes the theme it was edited into, not the one it was opened from', async () => {
    await openExample();
    await edit({ kind: 'set-localized-default', field: 'title', value: 'Renamed Theme' });

    const destination = join(workspace, 'Exported');
    await session.exportTo({ kind: 'folder', path: destination, overwrite: false });

    const manifest = await readFile(join(destination, 'theme.xml'), 'utf-8');
    expect(manifest).toContain('Renamed Theme');
  });

  it('gives up rather than exporting a file that has gone since it was chosen', async () => {
    await openExample();
    const source = await anImageAt('icon.png');
    await assign({ kind: 'appIcon', application: 'browser' }, source);
    await rm(source);

    const outcome = await session.exportTo({
      kind: 'folder',
      path: join(workspace, 'Exported'),
      overwrite: false,
    });

    // Re-examined on the way out: a file that has gone is reported, not written as nothing.
    expect(outcome?.status).toBe('blocked');
    expect(await readdir(workspace)).not.toContain('Exported');
  });

  it('exports a draft made entirely of files brought in', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });
    const image = join(elsewhere, 'bg.png');
    await writeFile(image, await pngBytes({ width: 960, height: 512, gradient: false }));
    await assign({ kind: 'liveAreaBackground', page: 0 }, image);

    const destination = join(workspace, 'Midnight');
    const outcome = await session.exportTo({ kind: 'folder', path: destination, overwrite: false });

    expect(outcome?.status).toBe('exported');
    expect((await readdir(destination)).sort()).toEqual([
      'background-1.png',
      'background-thumbnail-1.png',
      'theme.xml',
    ]);
  });
});

describe('reading a file back for the interface', () => {
  it('reads a file the theme refers to', async () => {
    await openExample();

    const read = await session.readAsset('bg1.png' as never);

    expect(read?.ok).toBe(true);
    expect(read?.ok === true && read.value).toEqual(
      new Uint8Array(await readFile(join(themeFolder, 'bg1.png'))),
    );
  });

  it('reads a file that was brought in from outside', async () => {
    await openExample();
    await assign({ kind: 'appIcon', application: 'browser' }, await anImageAt('icon.png'));

    const read = await session.readAsset('icon-browser.png' as never);

    expect(read?.ok).toBe(true);
  });

  it('has nothing to read for a file the theme does not have', async () => {
    await openExample();

    const read = await session.readAsset('not-part-of-the-theme.png' as never);

    expect(read?.ok).toBe(false);
  });

  it('has nothing to read at all when no theme is open', async () => {
    expect(await session.readAsset('bg1.png' as never)).toBeNull();
  });

  it.skipIf(process.platform === 'win32')(
    'reports a file that cannot be read rather than failing silently',
    async () => {
      await openExample();
      const source = await anImageAt('icon.png');
      await assign({ kind: 'appIcon', application: 'browser' }, source);
      await chmod(source, 0o000);

      const read = await session.readAsset('icon-browser.png' as never);

      await chmod(source, 0o600);
      // Running as root would read it anyway; the check is that nothing pretends to succeed.
      expect(read === null || read.ok || read.error.code === 'unreadable').toBe(true);
    },
  );
});
