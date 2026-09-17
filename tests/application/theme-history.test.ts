import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThemeSession,
  type ExportDestination,
  type LoadedTheme,
  type ThemeSession,
} from '@/application/session/theme-session';
import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type { ThemeEdit } from '@/domain/editing/theme-edit';
import { formatThemeColor } from '@/domain/model/theme-color';
import { hasErrors } from '@/domain/validation/report';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { describeHomeScreen, describeLockScreen } from '@/presentation/preview/screen-model';
import { sessionAdapters } from '../support/project-fixtures';
import { pngHeaderBytes } from '../support/binary-fixtures';
import { writeThemeFolder } from '../support/theme-folder-fixtures';

/**
 * Taking a change back, and putting it back.
 *
 * The history is a list of versions of the theme, and a version is two references — the
 * project, which is immutable and holds file names rather than files, and whatever had been
 * brought in at the time. So none of this copies a theme, and none of it holds a byte of
 * anybody's artwork. What these tests are about is that every change has an exact opposite
 * and that going back and forward lands on the same theme every time.
 */

const openExportTargetAt = (destination: ExportDestination) =>
  destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, { overwrite: destination.overwrite })
    : openArchiveExportTarget(destination.path, { overwrite: destination.overwrite });

let workspace: string;
let themeFolder: string;
let elsewhere: string;
let session: ThemeSession;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-history-'));
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

const edit = async (change: ThemeEdit): Promise<LoadedTheme> => {
  const result = await session.applyEdit(change);
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

const rename = (value: string): ThemeEdit => ({
  kind: 'set-localized-default',
  field: 'title',
  value,
});

const title = (): string => session.current()?.project.metadata.title.defaultValue ?? '';

const iconAt = (slot: 'browser' | 'music'): string | null =>
  session.current()?.project.home.appIcons.get(slot) ?? null;

describe('where a theme starts', () => {
  it('has nothing to take back when it has just been opened', async () => {
    const opened = await openExample();

    expect(opened).toMatchObject({ canUndo: false, canRedo: false });
    expect(await session.undo()).toBeNull();
    expect(await session.redo()).toBeNull();
  });

  it('has nothing to take back when it has just been started', () => {
    const draft = session.startDraft({ title: 'Midnight', provider: 'Somebody' });

    expect(draft).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('has nothing to take back when no theme is open at all', async () => {
    expect(await session.undo()).toBeNull();
    expect(await session.redo()).toBeNull();
  });
});

describe('one change', () => {
  it('can be taken back', async () => {
    await openExample();
    const changed = await edit(rename('Renamed'));

    expect(changed).toMatchObject({ canUndo: true, canRedo: false });

    const undone = await session.undo();

    expect(undone?.project.metadata.title.defaultValue).toBe('Example Theme');
    expect(undone).toMatchObject({ canUndo: false, canRedo: true });
  });

  it('can be put back', async () => {
    await openExample();
    await edit(rename('Renamed'));
    await session.undo();

    const redone = await session.redo();

    expect(redone?.project.metadata.title.defaultValue).toBe('Renamed');
    expect(redone).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('counts as a change of its own, so what is on screen is known to have moved', async () => {
    await openExample();
    const changed = await edit(rename('Renamed'));

    const undone = await session.undo();

    expect(undone?.revision).toBeGreaterThan(changed.revision);
  });
});

describe('several changes', () => {
  const steps = ['B', 'C', 'D'] as const;

  const applyAll = async (): Promise<void> => {
    await openExample();
    for (const step of steps) {
      await edit(rename(step));
    }
  };

  it('are taken back one at a time, in order', async () => {
    await applyAll();

    expect(title()).toBe('D');
    await session.undo();
    expect(title()).toBe('C');
    await session.undo();
    expect(title()).toBe('B');
    await session.undo();
    expect(title()).toBe('Example Theme');
  });

  it('are put back one at a time, in order', async () => {
    await applyAll();
    await session.undo();
    await session.undo();
    await session.undo();

    await session.redo();
    expect(title()).toBe('B');
    await session.redo();
    expect(title()).toBe('C');
    await session.redo();
    expect(title()).toBe('D');
  });

  it('stop at the beginning rather than going past it', async () => {
    await applyAll();
    for (let step = 0; step < 10; step += 1) {
      await session.undo();
    }

    expect(title()).toBe('Example Theme');
    expect(session.current()).toMatchObject({ canUndo: false, canRedo: true });
  });

  it('stop at the end rather than going past it', async () => {
    await applyAll();
    await session.undo();
    for (let step = 0; step < 10; step += 1) {
      await session.redo();
    }

    expect(title()).toBe('D');
    expect(session.current()).toMatchObject({ canUndo: true, canRedo: false });
  });
});

describe('changing something after taking a change back', () => {
  it('gives up what was taken back', async () => {
    await openExample();
    await edit(rename('B'));
    await edit(rename('C'));

    await session.undo();
    expect(title()).toBe('B');

    const branched = await edit(rename('D'));

    // The way back to C is gone: it was never part of this theme's history.
    expect(branched).toMatchObject({ canUndo: true, canRedo: false });
    expect(await session.redo()).toBeNull();
    expect(title()).toBe('D');
  });

  it('leaves the earlier changes where they were', async () => {
    await openExample();
    await edit(rename('B'));
    await edit(rename('C'));
    await session.undo();
    await edit(rename('D'));

    await session.undo();
    expect(title()).toBe('B');
    await session.undo();
    expect(title()).toBe('Example Theme');
  });
});

describe('changes that change nothing', () => {
  it('leave nothing to take back', async () => {
    const opened = await openExample();

    const unchanged = await edit(rename(opened.project.metadata.title.defaultValue));

    expect(unchanged.canUndo).toBe(false);
    expect(unchanged.revision).toBe(opened.revision);
  });

  it('do not disturb a history that is already there', async () => {
    await openExample();
    await edit(rename('B'));

    await edit(rename('B'));

    await session.undo();
    expect(title()).toBe('Example Theme');
  });

  it('do not give up what was taken back', async () => {
    await openExample();
    await edit(rename('B'));
    await session.undo();

    await edit(rename('Example Theme'));

    expect(session.current()?.canRedo).toBe(true);
  });
});

describe('a gesture that reports continuously', () => {
  const setBarColour = (value: string): ThemeEdit => ({
    kind: 'set-color',
    slot: { kind: 'barColor' },
    value,
  });

  const barColour = (): string | null => {
    const colour = session.current()?.project.informationBar.barColor ?? null;
    return colour === null ? null : formatThemeColor(colour);
  };

  it('is one step, however many colours the pointer passed over', async () => {
    await openExample();

    for (const value of ['FF0000', 'EE1100', 'DD2200', '00D1FF']) {
      await edit(setBarColour(value));
    }

    expect(barColour()).toBe('00D1FF');
    await session.undo();
    expect(barColour()).toBe('FF202020');
  });

  it('is a separate step from a different colour', async () => {
    await openExample();
    await edit(setBarColour('FF0000'));
    await edit({ kind: 'set-color', slot: { kind: 'dateColor' }, value: '00FF00' });

    await session.undo();

    expect(barColour()).toBe('FF0000');
  });

  it('is a separate step for each page it is applied to', async () => {
    await openExample();
    await edit({ kind: 'set-color', slot: { kind: 'bubbleFont', page: 0 }, value: 'FF0000' });
    await edit({ kind: 'set-color', slot: { kind: 'bubbleFont', page: 1 }, value: '00FF00' });

    await session.undo();

    const pages = session.current()?.project.home.pages ?? [];
    expect(pages[0]?.bubbleFontColor).not.toBeNull();
    expect(formatThemeColor(pages[1]?.bubbleFontColor ?? null!)).toBe('FFFFFFFF');
  });

  it('starts a new step once something else has happened in between', async () => {
    await openExample();
    await edit(setBarColour('FF0000'));
    await edit(rename('Renamed'));
    await edit(setBarColour('00FF00'));

    await session.undo();

    expect(barColour()).toBe('FF0000');
  });

  it('starts a new step after the change was taken back', async () => {
    await openExample();
    await edit(setBarColour('FF0000'));
    await session.undo();
    await session.redo();
    await edit(setBarColour('00FF00'));

    await session.undo();

    expect(barColour()).toBe('FF0000');
  });
});

describe('every kind of change', () => {
  it('takes back a translation', async () => {
    await openExample();
    await edit({ kind: 'set-translation', field: 'title', language: 'de', value: 'Beispiel' });

    await session.undo();

    expect(session.current()?.project.metadata.title.translations.has('de')).toBe(false);
  });

  it('takes back removing a translation', async () => {
    await openExample();
    await edit({ kind: 'set-translation', field: 'title', language: 'fr', value: null });

    await session.undo();

    expect(session.current()?.project.metadata.title.translations.get('fr')).toBe(
      "Theme d'exemple",
    );
  });

  it('takes back the theme version', async () => {
    await openExample();
    await edit({ kind: 'set-content-version', value: '09.09' });

    await session.undo();

    expect(session.current()?.project.metadata.contentVersion).toEqual({ major: 1, minor: 0 });
  });

  it('takes back adding a page', async () => {
    const opened = await openExample();
    await edit({ kind: 'add-page' });

    await session.undo();

    expect(session.current()?.project.home.pages).toHaveLength(opened.project.home.pages.length);
  });

  it('takes back removing a page, with everything that was on it', async () => {
    const opened = await openExample();
    const removed = opened.project.home.pages[1];
    await edit({ kind: 'remove-page', page: 1 });

    await session.undo();

    // The page comes back whole: its background, its thumbnail and its colours.
    expect(session.current()?.project.home.pages[1]).toEqual(removed);
  });

  it('takes back reordering pages', async () => {
    const opened = await openExample();
    await edit({ kind: 'move-page', page: 1, to: 0 });

    await session.undo();

    expect(session.current()?.project.home.pages).toEqual(opened.project.home.pages);
  });

  it('takes back a lock screen change', async () => {
    await openExample();
    await edit({ kind: 'set-date-layout', value: 2 });
    await edit({ kind: 'set-color', slot: { kind: 'notificationFontColor' }, value: 'FF00FF' });

    await session.undo();
    await session.undo();

    expect(session.current()?.project.startScreen.dateLayout).toBe(0);
    expect(
      formatThemeColor(session.current()?.project.startScreen.notificationFontColor ?? null!),
    ).toBe('00D1FF');
  });

  it('takes back an information bar change', async () => {
    await openExample();
    await edit({ kind: 'set-color', slot: { kind: 'indicatorColor' }, value: null });

    await session.undo();

    expect(session.current()?.project.informationBar.indicatorColor).not.toBeNull();
  });

  it('takes back a label shadow, including the difference between off and unset', async () => {
    await openExample();
    await edit({ kind: 'set-bubble-shadow', page: 0, value: null });

    await session.undo();

    expect(session.current()?.project.home.pages[0]?.bubbleFontShadow).toBe(true);
  });
});

describe('files brought into a theme', () => {
  it('goes back to the file that was there before, not to an empty slot', async () => {
    await openExample();
    await assign({ kind: 'appIcon', application: 'browser' }, await anImageAt('first.png'));

    expect(iconAt('browser')).toBe('icon-browser.png');
    await session.undo();

    // The theme came with an icon in this slot; taking back a replacement restores it.
    expect(iconAt('browser')).toBe('icon_web.png');
  });

  it('goes back to the file it had, when the name is the same either way', async () => {
    await openExample();
    await assign({ kind: 'appIcon', application: 'music' }, await anImageAt('first.png', 128, 128));
    await assign({ kind: 'appIcon', application: 'music' }, await anImageAt('second.png', 64, 64));

    const sizeOf = (theme: LoadedTheme | null): number | null => {
      const summary = theme?.assets.find((asset) => asset.path === 'icon-music.png');
      return summary?.lookup.status === 'found' && summary.lookup.asset.media.kind === 'image'
        ? summary.lookup.asset.media.width
        : null;
    };

    expect(sizeOf(session.current())).toBe(64);

    // Both files are called icon-music.png inside the theme, so the name alone says nothing:
    // what is restored is which file that name stands for.
    expect(sizeOf(await session.undo())).toBe(128);
    expect(sizeOf(await session.redo())).toBe(64);
  });

  it('takes back emptying a slot', async () => {
    await openExample();
    await edit({ kind: 'clear-asset', slot: { kind: 'appIcon', application: 'browser' } });

    expect(iconAt('browser')).toBeNull();
    await session.undo();

    expect(iconAt('browser')).toBe('icon_web.png');
  });

  it('puts a file back when the change is put back', async () => {
    await openExample();
    await assign({ kind: 'appIcon', application: 'browser' }, await anImageAt('first.png'));
    await session.undo();

    await session.redo();

    expect(iconAt('browser')).toBe('icon-browser.png');
  });

  it('says a file has gone rather than quietly showing another one', async () => {
    await openExample();
    const chosen = await anImageAt('first.png');
    await assign({ kind: 'appIcon', application: 'browser' }, chosen);
    await session.undo();
    await rm(chosen);

    const redone = await session.redo();

    const summary = redone?.assets.find((asset) => asset.path === 'icon-browser.png');
    expect(summary?.lookup.status).toBe('missing');
    expect(redone?.report.issues.map((issue) => issue.code)).toContain('asset.missing');
  });

  it('counts as a change to the files, so what was shown is fetched again', async () => {
    await openExample();
    const before = await assign(
      { kind: 'appIcon', application: 'browser' },
      await anImageAt('first.png'),
    );

    const undone = await session.undo();

    expect(undone?.assetRevision).toBeGreaterThan(before.assetRevision);
  });
});

describe('what the rest of the application sees', () => {
  it('checks the theme again, so what is reported follows the change back', async () => {
    await openExample();
    await edit(rename(''));

    expect(hasErrors(session.current()?.report ?? { issues: [] })).toBe(true);

    const undone = await session.undo();

    expect(hasErrors(undone?.report ?? { issues: [] })).toBe(false);
  });

  it('describes the same theme to the editor and to the preview', async () => {
    await openExample();
    await edit({ kind: 'set-color', slot: { kind: 'bubbleFont', page: 0 }, value: 'FF0000' });
    await session.undo();

    const theme = session.current();
    if (theme === null) {
      throw new Error('Expected a theme to be open');
    }

    const snapshot = {
      origin: theme.origin,
      label: theme.label,
      project: theme.project,
      report: theme.report,
      assets: theme.assets,
      canUndo: theme.canUndo,
      canRedo: theme.canRedo,
      revision: theme.revision,
      assetRevision: theme.assetRevision,
      isDirty: theme.isDirty,
    };

    // The preview reads the same snapshot the editor does, so taking a change back moves both:
    // this is the colour the theme was opened with, not the one that was set and taken back.
    expect(describeHomeScreen(snapshot, 0).labelColor).toBe('rgb(0 209 255 / 100%)');
    expect(formatThemeColor(theme.project.home.pages[0]?.bubbleFontColor ?? null!)).toBe('00D1FF');
    expect(describeLockScreen(snapshot).clock.value).toBe(0);
  });
});

describe('things that are not changes to the theme', () => {
  it('leaves the history alone when the files are examined again', async () => {
    await openExample();
    await edit(rename('Renamed'));

    const refreshed = await session.refresh();

    expect(refreshed).toMatchObject({ canUndo: true, canRedo: false });
    // And the change itself is still there to take back.
    expect(refreshed?.project.metadata.title.defaultValue).toBe('Renamed');
    await session.undo();
    expect(title()).toBe('Example Theme');
  });

  it('keeps what was taken back available after the files are examined again', async () => {
    await openExample();
    await edit(rename('Renamed'));
    await session.undo();

    await session.refresh();

    expect(session.current()?.canRedo).toBe(true);
    await session.redo();
    expect(title()).toBe('Renamed');
  });

  it('leaves the history alone when the theme is exported', async () => {
    await openExample();
    await edit(rename('Renamed'));

    const outcome = await session.exportTo({
      kind: 'folder',
      path: join(workspace, 'Exported'),
      overwrite: false,
    });

    expect(outcome?.status).toBe('exported');
    expect(session.current()).toMatchObject({ canUndo: true, canRedo: false });
    expect(await readdir(join(workspace, 'Exported'))).toContain('theme.xml');
  });

  it('forgets the history when a different theme is opened', async () => {
    await openExample();
    await edit(rename('Renamed'));

    await session.openFolder(themeFolder, 'Example Theme');

    expect(session.current()).toMatchObject({ canUndo: false, canRedo: false });
    expect(await session.undo()).toBeNull();
  });

  it('forgets the history when a theme is started from nothing', async () => {
    await openExample();
    await edit(rename('Renamed'));

    const draft = session.startDraft({ title: 'Midnight', provider: '' });

    expect(draft).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('forgets the history when the theme is closed', async () => {
    await openExample();
    await edit(rename('Renamed'));

    await session.close();

    expect(await session.undo()).toBeNull();
    expect(session.current()).toBeNull();
  });
});
