import { mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThemeSession,
  type ExportDestination,
  type ThemeSession,
} from '@/application/session/theme-session';
import { hasErrors, isExportable } from '@/domain/validation/report';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { sessionAdapters } from '../support/project-fixtures';
import { writeThemeFolder } from '../support/theme-folder-fixtures';
import { readZipArchive, zipEntryNames } from '../support/zip-reader';

/**
 * The workflow the desktop application drives, with the real filesystem behind it and no
 * Electron in sight. What the window does to a theme is what this test does to it.
 */

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

let workspace: string;
let themeFolder: string;
let session: ThemeSession;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-session-'));
  themeFolder = join(workspace, 'Example Theme');
  await writeThemeFolder(themeFolder);

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

const openExample = async () => {
  const opened = await session.openFolder(themeFolder, 'Example Theme');
  if (!opened.ok) {
    throw new Error(`Expected the theme to open, but it failed: ${opened.error.message}`);
  }
  return opened.value;
};

describe('opening a theme', () => {
  it('reads the theme, checks it and describes its files', async () => {
    const loaded = await openExample();

    expect(loaded.origin).toBe('folder');
    expect(loaded.label).toBe('Example Theme');
    expect(loaded.project.metadata.title.defaultValue).toBe('Example Theme');
    expect(loaded.assets.map((asset) => asset.path)).toContain('BGM.at9');
    expect(loaded.assets.every((asset) => asset.lookup.status === 'found')).toBe(true);
    expect(isExportable(loaded.report)).toBe(true);
  });

  it('reports a folder that is not a theme without becoming the open theme', async () => {
    const opened = await session.openFolder(workspace, 'workspace');

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe('manifest-missing');
    expect(session.current()).toBeNull();
  });

  it('keeps the theme that is open when opening another one fails', async () => {
    await openExample();

    await session.openFolder(join(workspace, 'nowhere'), 'nowhere');

    expect(session.current()?.label).toBe('Example Theme');
  });

  it('reports a manifest that cannot be read at all', async () => {
    await writeFile(join(themeFolder, 'theme.xml'), '<theme><HomeProperty></theme>', 'utf-8');

    const opened = await session.openFolder(themeFolder, 'Example Theme');

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe('malformed-xml');
  });
});

describe('starting a theme from nothing', () => {
  it('produces a theme that is valid but empty', () => {
    const draft = session.startDraft({ title: 'Midnight', provider: 'Someone' });

    expect(draft.origin).toBe('draft');
    expect(draft.label).toBe('Midnight');
    expect(draft.project.home.pages).toHaveLength(1);
    expect(draft.assets).toEqual([]);
    expect(hasErrors(draft.report)).toBe(false);
  });

  it('asks for a name, because the console shows one', () => {
    const draft = session.startDraft({ title: '', provider: '' });

    expect(draft.label).toBe('Untitled theme');
    expect(draft.report.issues.map((issue) => issue.code)).toContain('metadata.title-empty');
    expect(isExportable(draft.report)).toBe(false);
  });

  it('replaces whatever was open before', async () => {
    await openExample();

    session.startDraft({ title: 'Midnight', provider: '' });

    expect(session.current()?.origin).toBe('draft');
  });
});

describe('checking the theme again', () => {
  it('notices a file that has been deleted since the theme was opened', async () => {
    await openExample();
    await unlink(join(themeFolder, 'bg1.png'));

    const refreshed = await session.refresh();

    expect(refreshed?.report.issues.map((issue) => issue.code)).toContain('asset.missing');
    expect(refreshed === null || isExportable(refreshed.report)).toBe(false);
  });

  it('keeps the theme being edited rather than reading the manifest back over it', async () => {
    await openExample();
    await session.applyEdit({ kind: 'set-localized-default', field: 'title', value: 'Renamed' });

    const refreshed = await session.refresh();

    // Checking a theme is about its files. Whatever somebody has changed is theirs to keep
    // until they export it.
    expect(refreshed?.project.metadata.title.defaultValue).toBe('Renamed');
  });

  it('has nothing to do when no theme is open', async () => {
    expect(await session.refresh()).toBeNull();
  });
});

describe('exporting', () => {
  const destination = (kind: ExportDestination['kind'], name: string, overwrite = false) => ({
    kind,
    path: join(workspace, name),
    overwrite,
  });

  it('writes a theme folder', async () => {
    await openExample();

    const outcome = await session.exportTo(destination('folder', 'Exported'));

    expect(outcome?.status).toBe('exported');
    expect(await readdir(join(workspace, 'Exported'))).toContain('theme.xml');
  });

  it('writes an archive with the manifest at its root', async () => {
    await openExample();

    const outcome = await session.exportTo(destination('archive', 'Exported.zip'));

    expect(outcome?.status).toBe('exported');
    const archive = readZipArchive(await readFile(join(workspace, 'Exported.zip')));
    expect(zipEntryNames(archive)[0]).toBe('theme.xml');
  });

  it('refuses to replace something it did not put there', async () => {
    await openExample();
    await session.exportTo(destination('folder', 'Exported'));

    const outcome = await session.exportTo(destination('folder', 'Exported'));

    expect(outcome?.status).toBe('failed');
    if (outcome?.status !== 'failed') return;
    expect(outcome.failure.code).toBe('destination-exists');
  });

  it('replaces it once told to', async () => {
    await openExample();
    await session.exportTo(destination('folder', 'Exported'));

    const outcome = await session.exportTo(destination('folder', 'Exported', true));

    expect(outcome?.status).toBe('exported');
  });

  it('checks the theme again before writing anything, and stops if it no longer holds up', async () => {
    await openExample();
    await unlink(join(themeFolder, 'BGM.at9'));

    const outcome = await session.exportTo(destination('folder', 'Exported'));

    expect(outcome?.status).toBe('blocked');
    expect(await readdir(workspace)).not.toContain('Exported');
  });

  it('writes the theme it has open, whatever has happened to the manifest on disk', async () => {
    await openExample();
    await writeFile(join(themeFolder, 'theme.xml'), 'not xml at all', 'utf-8');

    const outcome = await session.exportTo(destination('folder', 'Exported'));

    // The manifest was read when the theme was opened; the theme is now what is being
    // edited, and the exported manifest is written from that.
    expect(outcome?.status).toBe('exported');
    expect(await readFile(join(workspace, 'Exported', 'theme.xml'), 'utf-8')).toContain('<theme');
  });

  it('exports a draft, which has a manifest and nothing else', async () => {
    session.startDraft({ title: 'Midnight', provider: 'Someone' });

    const outcome = await session.exportTo(destination('folder', 'Midnight'));

    expect(outcome?.status).toBe('exported');
    expect(await readdir(join(workspace, 'Midnight'))).toEqual(['theme.xml']);
  });

  it('has nothing to export once the theme is closed', async () => {
    await openExample();
    await session.close();

    expect(session.current()).toBeNull();
    expect(await session.exportTo(destination('folder', 'Exported'))).toBeNull();
  });
});
