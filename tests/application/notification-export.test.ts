import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createThemeSession, type ThemeSession } from '@/application/session/theme-session';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { pngBytes } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';

let workspace: string;
let destination: string;
let session: ThemeSession;
let badge: Uint8Array;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-notification-export-'));
  destination = join(workspace, 'Exported');
  await mkdir(join(workspace, 'inputs'));
  session = createThemeSession({
    codec: themeXmlCodec(),
    externalFiles: fileSystemExternalFiles(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt: (target) =>
      openFolderExportTarget(target.path, { overwrite: target.overwrite }),
    ...sessionAdapters(workspace),
  });
  session.startDraft({ title: 'Notification Theme', provider: 'Tests' });
  const wallpaper = join(workspace, 'inputs', 'wallpaper.png');
  await writeFile(wallpaper, await pngBytes({ width: 960, height: 512 }));
  expect((await session.assignAsset({ kind: 'liveAreaBackground', page: 0 }, wallpaper)).ok).toBe(
    true,
  );
  expect((await session.assignAsset({ kind: 'startScreenBackground' }, wallpaper)).ok).toBe(true);
  badge = await pngBytes({ width: 120, height: 110 });
  const image = join(workspace, 'inputs', 'badge.png');
  await writeFile(image, badge);
  expect((await session.assignAsset({ kind: 'noNoticeBadge' }, image)).ok).toBe(true);
  expect((await session.assignAsset({ kind: 'newNoticeBadge' }, image)).ok).toBe(true);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const exportTheme = async (): Promise<string> => {
  const result = await session.exportTo({ kind: 'folder', path: destination, overwrite: true });
  expect(result?.status).toBe('exported');
  return readFile(join(destination, 'theme.xml'), 'utf8');
};

describe('notification exports', () => {
  it('copies both chosen badges into the exported theme', async () => {
    const xml = await exportTheme();
    expect(xml).toContain('<m_noNoticeFilePath>notification-none.png</m_noNoticeFilePath>');
    expect(xml).toContain('<m_newNoticeFilePath>notification-new.png</m_newNoticeFilePath>');
    expect(new Uint8Array(await readFile(join(destination, 'notification-none.png')))).toEqual(
      badge,
    );
    expect(new Uint8Array(await readFile(join(destination, 'notification-new.png')))).toEqual(
      badge,
    );
  });

  it('resets both badges after clearing, saving and exporting over a previous theme', async () => {
    await exportTheme();
    expect(
      (await session.applyEdit({ kind: 'clear-asset', slot: { kind: 'noNoticeBadge' } })).ok,
    ).toBe(true);
    expect(
      (await session.applyEdit({ kind: 'clear-asset', slot: { kind: 'newNoticeBadge' } })).ok,
    ).toBe(true);
    const project = join(workspace, 'Theme.vitatheme');
    expect((await session.saveTo(project, 'Theme')).ok).toBe(true);
    await session.close();
    expect((await session.openProject(project, 'Theme')).ok).toBe(true);
    const xml = await exportTheme();
    expect(xml).toContain('<m_noNoticeFilePath></m_noNoticeFilePath>');
    expect(xml).toContain('<m_newNoticeFilePath></m_newNoticeFilePath>');
    expect(await readdir(destination)).not.toContain('notification-none.png');
    expect(await readdir(destination)).not.toContain('notification-new.png');
  });
});
