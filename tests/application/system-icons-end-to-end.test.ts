import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThemeSession,
  type ExportDestination,
  type ThemeSession,
} from '@/application/session/theme-session';
import { importSystemIconSet } from '@/application/use-cases/import-system-icon-set';
import { themedSystemIcons } from '@/domain/editing/system-icon-defaults';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { pngBytes } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';

/**
 * Icons from the editor to the exported theme.
 *
 * The thing worth proving here is what happens to the icons a theme does *not* replace: the
 * stand-in the editor draws for them is this application's own picture, and putting it into
 * an exported theme would replace the console's icon with it. So it is never exported, and
 * the manifest says nothing about the slot at all.
 */

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

let workspace: string;
let iconFolder: string;
let session: ThemeSession;

const files = fileSystemExternalFiles();

const exportFolder = async (name: string): Promise<string> => {
  const destination = join(workspace, name);
  const outcome = await session.exportTo({ kind: 'folder', path: destination, overwrite: true });
  expect(outcome?.status).toBe('exported');
  return destination;
};

const manifestOf = async (folder: string): Promise<string> =>
  readFile(join(folder, 'theme.xml'), 'utf-8');

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-icon-export-'));
  iconFolder = join(workspace, 'set');
  await mkdir(iconFolder, { recursive: true });

  session = createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: files,
    ...sessionAdapters(workspace),
  });
  session.startDraft({ title: 'Icon Theme', provider: 'Tests' });

  // A theme needs a wallpaper before it can be exported at all.
  const wallpaper = join(workspace, 'wallpaper.png');
  await writeFile(wallpaper, await pngBytes({ width: 960, height: 512 }));
  await session.assignAsset({ kind: 'liveAreaBackground', page: 0 }, wallpaper);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('a theme that replaces some icons and not others', () => {
  beforeEach(async () => {
    for (const name of ['icon_web.png', 'icon_settings.png']) {
      await writeFile(join(iconFolder, name), await pngBytes({ width: 128, height: 128 }));
    }
    await importSystemIconSet({
      session,
      files,
      folder: iconFolder,
      confirmReplacements: () => Promise.resolve(true),
    });
  });

  it('exports the icons it replaced', async () => {
    const exported = await exportFolder('Exported');
    const manifest = await manifestOf(exported);

    expect(await readdir(exported)).toEqual(
      expect.arrayContaining(['icon-browser.png', 'icon-settings.png']),
    );
    expect(manifest).toContain('<m_browser>');
    expect(manifest).toContain('icon-browser.png');
    expect(manifest).toContain('<m_settings>');
  });

  it('says nothing at all about the ones it left alone', async () => {
    const exported = await exportFolder('Exported');
    const manifest = await manifestOf(exported);

    for (const tag of ['m_music', 'm_trophy', 'm_near', 'm_power', 'm_calendar']) {
      expect(manifest).not.toContain(`<${tag}>`);
    }
  });

  it('never writes the stand-in the editor draws', async () => {
    const exported = await exportFolder('Exported');
    const written = await readdir(exported);

    // Fifteen slots are untouched, so there are two icon files and no more.
    expect(written.filter((name) => name.startsWith('icon-'))).toEqual([
      'icon-browser.png',
      'icon-settings.png',
    ]);
    // Nothing in the theme is an SVG: the stand-in is drawn in the interface and is not a
    // theme asset at all.
    expect(written.some((name) => name.endsWith('.svg'))).toBe(false);
  });

  it('keeps them through a save, a close and an open', async () => {
    const projectPath = join(workspace, 'Icon Theme.vitatheme');
    const saved = await session.saveTo(projectPath, 'Icon Theme');
    expect(saved.ok).toBe(true);

    await session.close();
    const reopened = await session.openProject(projectPath, 'Icon Theme');

    expect(reopened.ok).toBe(true);
    expect(reopened.ok && themedSystemIcons(reopened.value.project)).toEqual([
      'browser',
      'settings',
    ]);
  });

  it('exports what a reopened project holds, byte for byte', async () => {
    const before = await exportFolder('Before');
    const beforeIcon = await readFile(join(before, 'icon-browser.png'));

    const projectPath = join(workspace, 'Icon Theme.vitatheme');
    await session.saveTo(projectPath, 'Icon Theme');
    await session.close();
    await session.openProject(projectPath, 'Icon Theme');

    const after = await exportFolder('After');
    expect(await readFile(join(after, 'icon-browser.png'))).toEqual(beforeIcon);
  });
});

describe('restoring every default', () => {
  it('leaves an exported theme with no icons in it', async () => {
    for (const name of ['icon_web.png', 'icon_music.png']) {
      await writeFile(join(iconFolder, name), await pngBytes({ width: 128, height: 128 }));
    }
    await importSystemIconSet({
      session,
      files,
      folder: iconFolder,
      confirmReplacements: () => Promise.resolve(true),
    });

    const applied = await session.applyEdit({ kind: 'restore-system-icons' });
    expect(applied.ok).toBe(true);

    const exported = await exportFolder('Exported');
    const manifest = await manifestOf(exported);

    expect((await readdir(exported)).filter((name) => name.startsWith('icon-'))).toEqual([]);
    expect(manifest).not.toContain('m_browser');
    expect(manifest).not.toContain('m_music');
  });

  it('is one step to take back', async () => {
    await writeFile(join(iconFolder, 'icon_web.png'), await pngBytes({ width: 128, height: 128 }));
    await importSystemIconSet({
      session,
      files,
      folder: iconFolder,
      confirmReplacements: () => Promise.resolve(true),
    });

    await session.applyEdit({ kind: 'restore-system-icons' });
    expect(themedSystemIcons(session.current()!.project)).toEqual([]);

    await session.undo();
    expect(themedSystemIcons(session.current()!.project)).toEqual(['browser']);
  });
});
