import { describe, expect, it } from 'vitest';
import { newThemeProject, type ThemeProject } from '@/domain/model/theme-project';
import { parseThemeColor } from '@/domain/model/theme-color';
import { emptyAssetCatalog } from '@/domain/validation/asset-catalog';
import { summarizeThemeAssets, type ThemeAssetSummary } from '@/domain/validation/asset-inventory';
import { validationReport } from '@/domain/validation/report';
import { allHomeAppSlots } from '@/domain/vita/home-app-slots';
import { applyThemeEdit, type ThemeEdit } from '@/domain/editing/theme-edit';
import { withAssetAtSlot } from '@/domain/editing/theme-asset-slot';
import type { ThemeSnapshot } from '@/ipc';
import {
  describeHomeScreen,
  describeInformationBar,
  describeLockScreen,
  describeThemeList,
} from '@/presentation/preview/screen-model';
import { assetPath, foundAsset } from '../support/theme-fixtures';

/**
 * What the preview is looking at.
 *
 * Derived from the snapshot, every time, so the preview and the editor cannot come to hold
 * different ideas of the same theme. These tests are about that derivation — whether a slot
 * is drawable, what it says when it is not, and which page is being described — not about
 * how any of it looks, which is a stylesheet's business.
 */

const anImage = (width = 128, height = 128) =>
  foundAsset({ kind: 'image', format: 'png', width, height, encoding: null }, 2048);

const anAudioFile = () =>
  foundAsset({ kind: 'audio', format: 'at9', sampleRate: 48000, channelCount: 2 }, 4096);

/** Builds the snapshot the window would have been given for this theme. */
const snapshotOf = (
  project: ThemeProject,
  found: Record<string, ReturnType<typeof anImage>> = {},
): ThemeSnapshot => {
  const catalog = {
    lookup: (path: string) => found[path] ?? { status: 'missing' as const },
  };

  return {
    origin: 'draft',
    isDirty: false,
    label: 'Preview',
    project,
    report: validationReport([]),
    assets: summarizeThemeAssets(project, catalog),
    canUndo: false,
    canRedo: false,
    revision: 1,
    assetRevision: 1,
  };
};

const edited = (project: ThemeProject, ...edits: readonly ThemeEdit[]): ThemeProject =>
  edits.reduce((current, edit) => {
    const result = applyThemeEdit(current, edit);
    if (!result.ok) {
      throw new Error(`Expected the change to be accepted: ${result.error}`);
    }
    return result.value;
  }, project);

const aTheme = (): ThemeProject => newThemeProject({ title: 'Midnight', provider: 'Somebody' });

describe('the home screen', () => {
  it('shows the background of the page being looked at', () => {
    const project = edited(aTheme(), { kind: 'add-page' });
    const withBackgrounds = withAssetAtSlot(
      withAssetAtSlot(project, { kind: 'liveAreaBackground', page: 0 }, assetPath('first.png')),
      { kind: 'liveAreaBackground', page: 1 },
      assetPath('second.png'),
    );
    const snapshot = snapshotOf(withBackgrounds, {
      'first.png': anImage(960, 512),
      'second.png': anImage(960, 512),
    });

    expect(describeHomeScreen(snapshot, 0).background).toMatchObject({
      state: 'ready',
      path: 'first.png',
    });
    expect(describeHomeScreen(snapshot, 1).background).toMatchObject({
      state: 'ready',
      path: 'second.png',
    });
  });

  it('counts the pages, and says which one is being shown', () => {
    const snapshot = snapshotOf(edited(aTheme(), { kind: 'add-page' }, { kind: 'add-page' }));

    expect(describeHomeScreen(snapshot, 2)).toMatchObject({ page: 2, pageCount: 3 });
  });

  it('falls back to the first page when asked for one that is not there', () => {
    const snapshot = snapshotOf(aTheme());

    expect(describeHomeScreen(snapshot, 7).page).toBe(0);
    expect(describeHomeScreen(snapshot, -1).page).toBe(0);
  });

  it('says a background has not been chosen rather than showing something else', () => {
    expect(describeHomeScreen(snapshotOf(aTheme()), 0).background).toMatchObject({
      state: 'unset',
      path: null,
    });
  });

  it('says a background is missing when the file is not there', () => {
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'liveAreaBackground', page: 0 },
      assetPath('gone.png'),
    );

    expect(describeHomeScreen(snapshotOf(project), 0).background).toMatchObject({
      state: 'missing',
      path: 'gone.png',
    });
  });

  it('says a file it cannot draw is unusable rather than drawing nothing silently', () => {
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'liveAreaBackground', page: 0 },
      assetPath('music.at9'),
    );

    expect(
      describeHomeScreen(snapshotOf(project, { 'music.at9': anAudioFile() }), 0).background,
    ).toMatchObject({ state: 'unusable' });
  });

  it('has a place for every system application, themed or not', () => {
    const home = describeHomeScreen(snapshotOf(aTheme()), 0);

    expect(home.bubbles).toHaveLength(allHomeAppSlots().length);
    expect(home.bubbles.every((bubble) => bubble.icon.state === 'unset')).toBe(true);
    expect(home.bubbles.map((bubble) => bubble.label)).toContain('Content Manager');
  });

  it('shows an icon as soon as one is put in its slot', () => {
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'appIcon', application: 'browser' },
      assetPath('icon-browser.png'),
    );
    const snapshot = snapshotOf(project, { 'icon-browser.png': anImage() });

    const browser = describeHomeScreen(snapshot, 0).bubbles.find(
      (bubble) => bubble.slot === 'browser',
    );

    expect(browser?.icon).toMatchObject({ state: 'ready', path: 'icon-browser.png' });
  });

  it('stops showing it as soon as the slot is emptied', () => {
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'appIcon', application: 'browser' },
      assetPath('icon-browser.png'),
    );
    const cleared = edited(project, {
      kind: 'clear-asset',
      slot: { kind: 'appIcon', application: 'browser' },
    });

    const browser = describeHomeScreen(snapshotOf(cleared), 0).bubbles.find(
      (bubble) => bubble.slot === 'browser',
    );

    expect(browser?.icon.state).toBe('unset');
  });

  it('takes the label colour and shadow from the page they belong to', () => {
    const project = edited(
      aTheme(),
      { kind: 'add-page' },
      { kind: 'set-color', slot: { kind: 'bubbleFont', page: 1 }, value: '00D1FF' },
      { kind: 'set-bubble-shadow', page: 1, value: true },
    );
    const snapshot = snapshotOf(project);

    expect(describeHomeScreen(snapshot, 0)).toMatchObject({ labelColor: null, labelShadow: false });
    expect(describeHomeScreen(snapshot, 1)).toMatchObject({
      labelColor: 'rgb(0 209 255 / 100%)',
      labelShadow: true,
    });
  });

  it('keeps transparency in a colour rather than flattening it', () => {
    const project = edited(aTheme(), {
      kind: 'set-color',
      slot: { kind: 'bubbleFont', page: 0 },
      value: '80FFFFFF',
    });

    expect(describeHomeScreen(snapshotOf(project), 0).labelColor).toBe('rgb(255 255 255 / 50%)');
  });

  it('mentions background music without pretending to play it', () => {
    const project = withAssetAtSlot(aTheme(), { kind: 'backgroundMusic' }, assetPath('music.at9'));

    expect(describeHomeScreen(snapshotOf(aTheme()), 0).hasBackgroundMusic).toBe(false);
    expect(describeHomeScreen(snapshotOf(project), 0).hasBackgroundMusic).toBe(true);
  });
});

describe('the lock screen', () => {
  it('shows the wallpaper the theme set', () => {
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'startScreenBackground' },
      assetPath('lock.png'),
    );

    expect(
      describeLockScreen(snapshotOf(project, { 'lock.png': anImage(960, 512) })).wallpaper,
    ).toMatchObject({ state: 'ready', path: 'lock.png' });
  });

  it.each([
    [0, 'lower-left'],
    [1, 'upper-left'],
    [2, 'lower-right'],
  ])('puts the clock where position %i is reported to be', (value, corner) => {
    const project = edited(aTheme(), { kind: 'set-date-layout', value });

    expect(describeLockScreen(snapshotOf(project)).clock).toMatchObject({
      corner,
      value,
      documented: true,
    });
  });

  it('marks a position nobody has documented as such, and leaves it where the console would', () => {
    const project = edited(aTheme(), { kind: 'set-date-layout', value: 9 });

    expect(describeLockScreen(snapshotOf(project)).clock).toMatchObject({
      corner: 'lower-left',
      value: 9,
      documented: false,
    });
  });

  it('says nothing was chosen when the theme leaves the position unset', () => {
    expect(describeLockScreen(snapshotOf(aTheme())).clock).toMatchObject({
      value: null,
      documented: false,
    });
  });

  it('carries the notification colours through as they are', () => {
    const project = edited(
      aTheme(),
      { kind: 'set-color', slot: { kind: 'notificationBackgroundColor' }, value: '64FFFFFF' },
      { kind: 'set-color', slot: { kind: 'notificationBorderColor' }, value: '20FFFFFF' },
      { kind: 'set-color', slot: { kind: 'notificationFontColor' }, value: '00D1FF' },
    );

    expect(describeLockScreen(snapshotOf(project)).notification).toEqual({
      background: 'rgb(255 255 255 / 39%)',
      border: 'rgb(255 255 255 / 13%)',
      font: 'rgb(0 209 255 / 100%)',
    });
  });
});

describe('the information bar', () => {
  it('carries every colour the bar has', () => {
    const project = edited(
      aTheme(),
      { kind: 'set-color', slot: { kind: 'barColor' }, value: 'FF202020' },
      { kind: 'set-color', slot: { kind: 'indicatorColor' }, value: 'FFFDFDFD' },
      { kind: 'set-color', slot: { kind: 'noticeFontColor' }, value: 'FFFFFFFF' },
      { kind: 'set-color', slot: { kind: 'noticeGlowColor' }, value: '00D1FF' },
    );

    expect(describeInformationBar(snapshotOf(project))).toMatchObject({
      barColor: 'rgb(32 32 32 / 100%)',
      indicatorColor: 'rgb(253 253 253 / 100%)',
      noticeFontColor: 'rgb(255 255 255 / 100%)',
      noticeGlowColor: 'rgb(0 209 255 / 100%)',
    });
  });

  it('leaves an unset colour unset rather than inventing one', () => {
    expect(describeInformationBar(snapshotOf(aTheme()))).toMatchObject({
      barColor: null,
      indicatorColor: null,
    });
  });

  it('describes both badges', () => {
    const project = withAssetAtSlot(aTheme(), { kind: 'noNoticeBadge' }, assetPath('none.png'));
    const bar = describeInformationBar(snapshotOf(project, { 'none.png': anImage(120, 110) }));

    expect(bar.noNoticeBadge).toMatchObject({ state: 'ready', path: 'none.png' });
    expect(bar.newNoticeBadge.state).toBe('unset');
  });
});

describe('the theme list', () => {
  it('shows the theme as the console would list it', () => {
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'packageThumbnail' },
      assetPath('thumbnail.png'),
    );

    expect(
      describeThemeList(snapshotOf(project, { 'thumbnail.png': anImage(226, 128) })),
    ).toMatchObject({
      title: 'Midnight',
      provider: 'Somebody',
      thumbnail: { state: 'ready' },
    });
  });

  it('has a thumbnail place for every page', () => {
    const project = edited(aTheme(), { kind: 'add-page' }, { kind: 'add-page' });

    expect(describeThemeList(snapshotOf(project)).pageThumbnails).toHaveLength(3);
  });

  it('follows the name as it is edited', () => {
    const renamed = edited(aTheme(), {
      kind: 'set-localized-default',
      field: 'title',
      value: 'Twilight',
    });

    expect(describeThemeList(snapshotOf(renamed)).title).toBe('Twilight');
  });
});

describe('what the preview is derived from', () => {
  it('is the snapshot and nothing else', () => {
    // Replacing a file is visible in the preview because the preview holds nothing of its
    // own: it reads what the snapshot says, every time it is asked.
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'appIcon', application: 'music' },
      assetPath('icon-music.png'),
    );

    const before = snapshotOf(project);
    const after = snapshotOf(project, { 'icon-music.png': anImage() });

    const stateOf = (snapshot: ThemeSnapshot): string =>
      describeHomeScreen(snapshot, 0).bubbles.find((bubble) => bubble.slot === 'music')?.icon
        .state ?? 'none';

    expect(stateOf(before)).toBe('missing');
    expect(stateOf(after)).toBe('ready');
  });

  it('uses what the theme says about a file, not what it is called', () => {
    const summary: ThemeAssetSummary = {
      path: assetPath('looks-like-an-image.png'),
      usages: ['appIcon'],
      locations: ['home.appIcons.browser'],
      lookup: anAudioFile(),
    };
    const project = withAssetAtSlot(
      aTheme(),
      { kind: 'appIcon', application: 'browser' },
      summary.path,
    );

    const snapshot: ThemeSnapshot = {
      ...snapshotOf(project),
      assets: [summary],
    };

    expect(
      describeHomeScreen(snapshot, 0).bubbles.find((bubble) => bubble.slot === 'browser')?.icon
        .state,
    ).toBe('unusable');
  });

  it('describes an empty theme without anything to draw', () => {
    const empty = summarizeThemeAssets(aTheme(), emptyAssetCatalog());

    expect(empty).toEqual([]);
    expect(parseThemeColor('00D1FF').ok).toBe(true);
  });
});
