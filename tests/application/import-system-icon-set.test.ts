import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FOLDER_ENTRIES } from '@/application/ports/external-file';
import { MAX_THEME_ASSET_BYTES } from '@/application/ports/theme-assets';
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
import { jpegBytes, pngBytes } from '../support/image-fixtures';
import { sessionAdapters } from '../support/project-fixtures';

/**
 * A folder of system icons somebody chose.
 *
 * This is the one place the application reads more than one file at a time, so it is also
 * the one place where "the folder is untrusted" has to mean something specific: nothing is
 * descended into, nothing is followed, a name buys a file no trust at all, and a folder full
 * of something else leaves the theme exactly as it was.
 */

const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

let workspace: string;
let folder: string;
let session: ThemeSession;

const files = fileSystemExternalFiles();

const anIcon = async (name: string, width = 128, height = 128): Promise<void> => {
  await writeFile(join(folder, name), await pngBytes({ width, height }));
};

const importFrom = (from = folder) =>
  importSystemIconSet({
    session,
    files,
    folder: from,
    confirmReplacements: () => Promise.resolve(true),
  });

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-icons-'));
  folder = join(workspace, 'icon set');
  await mkdir(folder, { recursive: true });

  session = createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles: files,
    ...sessionAdapters(workspace),
  });
  session.startDraft({ title: 'Icon Set Theme', provider: 'Tests' });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('a folder of icons', () => {
  it('replaces every slot it names', async () => {
    for (const name of [
      'icon_web.png',
      'icon_calendar.png',
      'icon_photos.png',
      'icon_mail.png',
      'icon_friends.png',
      'icon_cma.png',
      'icon_messages.png',
      'icon_music.png',
      'icon_near.png',
      'icon_parental.png',
      'icon_party.png',
      'icon_power.png',
      'icon_ps3link.png',
      'icon_ps4link.png',
      'icon_settings.png',
      'icon_trophies.png',
      'icon_videos.png',
    ]) {
      await anIcon(name);
    }

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    expect(outcome.status === 'imported' && outcome.summary.applied).toHaveLength(17);
    expect(themedSystemIcons(session.current()!.project)).toHaveLength(17);
  });

  it('is one change to take back, however many icons it held', async () => {
    await anIcon('icon_web.png');
    await anIcon('icon_music.png');
    await anIcon('icon_settings.png');

    await importFrom();
    expect(themedSystemIcons(session.current()!.project)).toEqual(['browser', 'music', 'settings']);

    await session.undo();
    expect(themedSystemIcons(session.current()!.project)).toEqual([]);

    await session.redo();
    expect(themedSystemIcons(session.current()!.project)).toEqual(['browser', 'music', 'settings']);
  });

  it('asks before replacing an existing custom icon and leaves it untouched on cancel', async () => {
    await anIcon('icon_web.png');
    await importFrom();
    const before = session.current();
    let offered: readonly { label: string; existing: string; incoming: string }[] = [];

    const outcome = await importSystemIconSet({
      session,
      files,
      folder,
      confirmReplacements: (replacements) => {
        offered = replacements;
        return Promise.resolve(false);
      },
    });

    expect(outcome.status).toBe('cancelled');
    expect(offered).toEqual([
      { label: 'Browser', existing: 'icon-browser.png', incoming: 'icon_web.png' },
    ]);
    expect(session.current()?.revision).toBe(before?.revision);
    expect(session.current()?.project).toEqual(before?.project);
    expect(JSON.stringify(offered)).not.toContain(workspace);
  });

  it('replaces an existing custom icon only after confirmation', async () => {
    await anIcon('icon_web.png');
    await importFrom();
    let confirmed = false;

    const outcome = await importSystemIconSet({
      session,
      files,
      folder,
      confirmReplacements: () => {
        confirmed = true;
        return Promise.resolve(true);
      },
    });

    expect(confirmed).toBe(true);
    expect(outcome.status).toBe('imported');
  });

  it('places the ones it recognises and reports the rest', async () => {
    await anIcon('icon_web.png');
    await anIcon('icon_settings.png');
    await writeFile(join(folder, 'holiday.png'), await pngBytes({ width: 64, height: 64 }));
    await writeFile(join(folder, 'notes.txt'), 'nothing to do with icons');

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    if (outcome.status !== 'imported') return;
    expect([...outcome.summary.applied.map((entry) => entry.slot)].sort()).toEqual([
      'browser',
      'settings',
    ]);
    expect([...outcome.summary.ignored].sort()).toEqual(['holiday.png', 'notes.txt']);
    expect(outcome.summary.rejected).toEqual([]);
  });

  it('refuses to choose when two files claim the same slot', async () => {
    await anIcon('icon_video.png');
    await anIcon('icon_videos.png');

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    if (outcome.status !== 'imported') return;
    // One of the two goes in; the other is reported rather than silently overwriting it.
    expect(outcome.summary.applied).toHaveLength(1);
    expect(outcome.summary.ambiguous).toEqual(['icon_videos.png']);
  });

  it('changes nothing when it holds no icons at all', async () => {
    await writeFile(join(folder, 'a.png'), await pngBytes({ width: 10, height: 10 }));
    await writeFile(join(folder, 'b.png'), await pngBytes({ width: 10, height: 10 }));

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    expect(outcome.status === 'imported' && outcome.summary.applied).toEqual([]);
    expect(themedSystemIcons(session.current()!.project)).toEqual([]);
    // Nothing happened, so there is nothing to take back.
    expect(await session.undo()).toBeNull();
  });

  it('never says where the folder was', async () => {
    await anIcon('icon_web.png');
    await writeFile(join(folder, 'strange.png'), await pngBytes({ width: 8, height: 8 }));

    const outcome = await importFrom();
    const asText = JSON.stringify(outcome);

    expect(asText).not.toContain(workspace);
    expect(asText).not.toContain('/');
  });
});

describe('a folder that is not what it claims', () => {
  it('takes a picture whose name says one thing and whose bytes say another', async () => {
    // A JPEG called icon_music.png: the name places it, the bytes describe it, and the
    // validator is what decides whether the theme may be exported with it.
    await writeFile(join(folder, 'icon_music.png'), await jpegBytes({ width: 128, height: 128 }));

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    if (outcome.status !== 'imported') return;
    expect(outcome.summary.applied.map((entry) => entry.slot)).toEqual(['music']);

    const assets = session.current()!.assets;
    const stored = assets.find((asset) => asset.path.startsWith('icon-music'));
    expect(stored?.path).toBe('icon-music.jpg');
    expect(stored?.lookup.status === 'found' && stored.lookup.asset.media).toMatchObject({
      kind: 'image',
      format: 'jpeg',
    });
  });

  it('reports a file that is not a picture at all', async () => {
    await writeFile(join(folder, 'icon_power.png'), 'this is text, not an image');

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    if (outcome.status !== 'imported') return;
    // It is still placed — the slot names it — and the validator reports what it is.
    const stored = session.current()!.assets.find((asset) => asset.path.startsWith('icon-power'));
    expect(stored?.lookup.status === 'found' && stored.lookup.asset.media.kind).toBe(
      'unrecognized',
    );
  });

  it('reports a file too large to be a theme asset', async () => {
    await writeFile(join(folder, 'icon_settings.png'), Buffer.alloc(MAX_THEME_ASSET_BYTES + 1));

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    if (outcome.status !== 'imported') return;
    expect(outcome.summary.applied).toEqual([]);
    expect(outcome.summary.rejected).toHaveLength(1);
    expect(outcome.summary.rejected[0]?.name).toBe('icon_settings.png');
    expect(themedSystemIcons(session.current()!.project)).toEqual([]);
  });

  it('does not follow a link out of the folder', async () => {
    const outside = join(workspace, 'elsewhere.png');
    await writeFile(outside, await pngBytes({ width: 128, height: 128 }));
    await symlink(outside, join(folder, 'icon_web.png'));
    await anIcon('icon_music.png');

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    if (outcome.status !== 'imported') return;
    expect(outcome.summary.applied.map((entry) => entry.slot)).toEqual(['music']);
  });

  it('does not descend into a folder inside it', async () => {
    await mkdir(join(folder, 'more icons'), { recursive: true });
    await writeFile(
      join(folder, 'more icons', 'icon_web.png'),
      await pngBytes({ width: 128, height: 128 }),
    );

    const outcome = await importFrom();

    expect(outcome.status).toBe('imported');
    expect(outcome.status === 'imported' && outcome.summary.applied).toEqual([]);
  });

  it('refuses a folder holding far more than an icon set does', async () => {
    await Promise.all(
      Array.from({ length: MAX_FOLDER_ENTRIES + 1 }, (_unused, index) =>
        writeFile(join(folder, `file-${String(index)}.txt`), 'x'),
      ),
    );

    const outcome = await importFrom();

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.message).toContain(String(MAX_FOLDER_ENTRIES));
  });

  it('reports a folder that is not there rather than failing oddly', async () => {
    const outcome = await importFrom(join(workspace, 'no such folder'));

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.message).not.toContain(workspace);
  });

  it('reports being handed a file where a folder was expected', async () => {
    const file = join(workspace, 'not-a-folder.png');
    await writeFile(file, await pngBytes({ width: 8, height: 8 }));

    const outcome = await importFrom(file);

    expect(outcome.status).toBe('failed');
  });
});
