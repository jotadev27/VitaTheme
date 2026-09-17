import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_THEME_ASSET_BYTES } from '@/application/ports/theme-assets';
import {
  createThemeSession,
  type ExportDestination,
  type ThemeSession,
} from '@/application/session/theme-session';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { createAppController, type AppController } from '@/main/app/app-controller';
import type { AppDialogs } from '@/main/app/dialogs';
import { parseThemeAssetPathRequest } from '@/main/ipc/requests';
import { sessionAdapters } from '../support/project-fixtures';
import { pngHeaderBytes, riffWaveBytes } from '../support/binary-fixtures';
import { COMPLETE_MANIFEST } from '../support/manifest-fixtures';
import { writeThemeFolder } from '../support/theme-folder-fixtures';

/**
 * The preview must not become a way to read the machine.
 *
 * Showing a picture is the one operation that sends bytes to the window, so it is the one
 * worth attacking. Three things stand in the way, and each is checked here: the path is
 * parsed by the same rules as every other path in the application, it has to be a file the
 * open theme already refers to, and it is read through that theme's own confined source.
 *
 * The theme being previewed is treated as hostile throughout — it is a folder that came from
 * somewhere else, and its manifest is somebody else's text.
 */

vi.mock('electron', () => ({ shell: { showItemInFolder: () => undefined } }));

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

const openExportTargetAt = (destination: ExportDestination) =>
  destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, { overwrite: destination.overwrite })
    : openArchiveExportTarget(destination.path, { overwrite: destination.overwrite });

const refusingDialogs = (): AppDialogs => ({
  chooseThemeFolder: () => Promise.resolve(null),
  chooseExportFolder: () => Promise.resolve(null),
  chooseArchiveFile: () => Promise.resolve(null),
  chooseAssetFile: () => Promise.resolve(null),
  chooseIconSetFolder: () => Promise.resolve(null),
  confirmIconSetReplacements: () => Promise.resolve(false),
  chooseProjectFile: () => Promise.resolve(null),
  chooseProjectDestination: () => Promise.resolve(null),
  confirmUnsavedChanges: () => Promise.resolve('cancel' as const),
});

let workspace: string;
let themeFolder: string;
let outside: string;
let session: ThemeSession;
let controller: AppController;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-preview-security-'));
  themeFolder = join(workspace, 'theme');
  outside = join(workspace, 'outside');
  await mkdir(outside);

  session = createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: fileSystemExternalFiles(),
    ...sessionAdapters(workspace),
  });

  controller = createAppController({
    session,
    dialogs: refusingDialogs(),
    externalFiles: fileSystemExternalFiles(),
    publish: () => undefined,
    recentProjects: { read: () => Promise.resolve([]), write: () => Promise.resolve() },
    projects: { exists: () => Promise.resolve(true) },
  });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const openTheme = async (): Promise<void> => {
  const opened = await session.openFolder(themeFolder, 'theme');
  if (!opened.ok) {
    throw new Error(`Expected the theme to open: ${opened.error.message}`);
  }
};

/** What the window would have to say to ask for a file, unchecked. */
const preview = (path: string) => controller.previewAsset(path as ThemeAssetPath);

describe('paths the window is not allowed to name', () => {
  beforeEach(async () => {
    await writeThemeFolder(themeFolder);
    await writeFile(join(outside, 'private.png'), pngHeaderBytes({ width: 8, height: 8 }));
    await openTheme();
  });

  it.each([
    ['../../outside/private.png', 'climbing out of the theme'],
    ['../outside/private.png', 'climbing out one level'],
    ['/etc/passwd', 'an absolute path'],
    ['/private/etc/hosts', 'another absolute path'],
    ['C:/Windows/system32/config/sam', 'a drive letter'],
    ['theme\\..\\..\\outside\\private.png', 'Windows separators'],
    ['bg1.png/../../outside/private.png', 'traversal after a real file'],
    ['', 'nothing at all'],
  ])('refuses %j — %s at the boundary', (path: string, _description: string) => {
    // It never even becomes a path: the guard the window's message goes through rejects it.
    expect(parseThemeAssetPathRequest({ path }).ok).toBe(false);
  });

  it('shows nothing for a file that exists but the theme does not refer to', async () => {
    await writeFile(
      join(themeFolder, 'not-referenced.png'),
      pngHeaderBytes({ width: 8, height: 8 }),
    );

    // The file is inside the theme folder and is a perfectly good image. It is still not part
    // of the theme, so there is nothing to show.
    expect(await preview('not-referenced.png')).toBeNull();
  });

  it('shows nothing for the theme manifest itself', async () => {
    expect(await preview('theme.xml')).toBeNull();
  });

  it('shows nothing when no theme is open at all', async () => {
    await session.close();

    expect(await preview('bg1.png')).toBeNull();
  });
});

describe('files a theme refers to but cannot be shown', () => {
  it('shows nothing for music', async () => {
    await writeThemeFolder(themeFolder);
    await openTheme();

    expect(await preview('BGM.at9')).toBeNull();
  });

  it('shows nothing for a file that is not there', async () => {
    await writeThemeFolder(themeFolder);
    await openTheme();
    await rm(join(themeFolder, 'bg1.png'));
    await session.refresh();

    expect(await preview('bg1.png')).toBeNull();
  });

  it('shows nothing for a file that is not any format it recognises', async () => {
    await writeThemeFolder(themeFolder);
    await writeFile(join(themeFolder, 'bg1.png'), 'this is not an image at all');
    await openTheme();

    expect(await preview('bg1.png')).toBeNull();
  });

  it('shows nothing for a file claiming to be an image by its name alone', async () => {
    await writeThemeFolder(themeFolder);
    // Named .png, actually audio. What a file is called decides nothing.
    await writeFile(join(themeFolder, 'bg1.png'), riffWaveBytes({ atrac9: true }));
    await openTheme();

    expect(await preview('bg1.png')).toBeNull();
  });

  it('refuses to turn a file far larger than a theme asset into a message', async () => {
    await writeThemeFolder(themeFolder);
    const handle = await open(join(themeFolder, 'bg1.png'), 'w');
    await handle.truncate(MAX_THEME_ASSET_BYTES - 1);
    await handle.close();
    await openTheme();

    // Well within what the application will read, and far beyond what it will send onward.
    expect(await preview('bg1.png')).toBeNull();
  });

  it('shows a file that is genuinely an image the theme refers to', async () => {
    await writeThemeFolder(themeFolder);
    await openTheme();

    const shown = await preview('bg1.png');

    expect(shown?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    // Pixels, and nothing else: no name, no location, no other field to read.
    expect(Object.keys(shown ?? {})).toEqual(['dataUrl']);
    expect(shown?.dataUrl).not.toContain(workspace);
    expect(shown?.dataUrl).not.toContain(tmpdir());
    expect(shown?.dataUrl).not.toContain('bg1.png');
  });
});

describe.skipIf(!symbolicLinksAvailable)('links out of the theme folder', () => {
  it('shows nothing for a file that is a link to somewhere outside', async () => {
    await writeThemeFolder(themeFolder);
    const secret = join(outside, 'private.png');
    await writeFile(secret, pngHeaderBytes({ width: 960, height: 512 }));
    await rm(join(themeFolder, 'bg1.png'));
    await symlink(secret, join(themeFolder, 'bg1.png'));
    await openTheme();

    // The theme refers to it by a name inside itself, and it resolves outside. That is the
    // whole of the attack, and containment is what stops it.
    expect(await preview('bg1.png')).toBeNull();
  });

  it('shows nothing for a file reached through a linked folder', async () => {
    await writeThemeFolder(
      themeFolder,
      COMPLETE_MANIFEST.replace('bg1.png', 'elsewhere/private.png'),
    );
    await writeFile(join(outside, 'private.png'), pngHeaderBytes({ width: 960, height: 512 }));
    await symlink(outside, join(themeFolder, 'elsewhere'));
    await openTheme();

    expect(await preview('elsewhere/private.png')).toBeNull();
  });
});

describe('a manifest that tries to reach outside the theme', () => {
  it('never turns a traversing reference into part of the theme', async () => {
    await writeThemeFolder(
      themeFolder,
      COMPLETE_MANIFEST.replace('lockpaper.png', '../../outside/private.png'),
    );
    await writeFile(join(outside, 'private.png'), pngHeaderBytes({ width: 960, height: 512 }));
    await openTheme();

    const theme = session.current();
    expect(theme?.project.startScreen.background).toBeNull();
    expect(theme?.assets.map((asset) => asset.path)).not.toContain('../../outside/private.png');
    expect(theme?.report.issues.map((issue) => issue.code)).toContain('manifest.unsafe-asset-path');
    expect(await preview('../../outside/private.png')).toBeNull();
  });

  it('never turns an absolute reference into part of the theme', async () => {
    await writeThemeFolder(themeFolder, COMPLETE_MANIFEST.replace('lockpaper.png', '/etc/passwd'));
    await openTheme();

    expect(session.current()?.project.startScreen.background).toBeNull();
    expect(await preview('/etc/passwd')).toBeNull();
  });
});
