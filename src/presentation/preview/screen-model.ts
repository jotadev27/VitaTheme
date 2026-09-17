import type { ThemeColor } from '@/domain/model/theme-color';
import type { ThemeAssetSummary } from '@/domain/validation/asset-inventory';
import { allHomeAppSlots, type HomeAppSlotId } from '@/domain/vita/home-app-slots';
import { DATE_LAYOUT_CONFIDENCE, DATE_LAYOUT_OPTIONS } from '@/domain/vita/start-screen';
import type { ThemeSnapshot } from '@/ipc';
import { cssColor } from '../format';

/**
 * What the preview is looking at.
 *
 * Derived from the snapshot every time it is asked for, and holding nothing: there is one
 * theme in this application, on the other side of the bridge, and this turns it into the
 * handful of questions a picture of a screen needs answered. Nothing here decides what a
 * theme *is* — it decides how to show what it already says.
 *
 * Where the console's own behaviour is not documented, this says so rather than guessing
 * quietly. `PreviewImage` is the shape that keeps that honest: a file the preview would draw,
 * or the reason it cannot, never a stand-in that looks like artwork somebody supplied.
 */

export type PreviewImageState = 'ready' | 'unset' | 'missing' | 'unusable';

export interface PreviewImage {
  readonly state: PreviewImageState;
  /** The file to draw, when there is one to draw. Always a path inside the theme. */
  readonly path: string | null;
  /** What the slot is for, said plainly, for the empty state. */
  readonly label: string;
}

const imageFor = (
  label: string,
  path: string | null,
  assets: readonly ThemeAssetSummary[],
): PreviewImage => {
  if (path === null) {
    return { state: 'unset', path: null, label };
  }

  const summary = assets.find((candidate) => candidate.path === path);
  if (summary === undefined || summary.lookup.status === 'missing') {
    return { state: 'missing', path, label };
  }
  if (summary.lookup.status === 'unreadable' || summary.lookup.asset.media.kind !== 'image') {
    return { state: 'unusable', path, label };
  }

  return { state: 'ready', path, label };
};

export interface InformationBarPreview {
  readonly barColor: string | null;
  readonly indicatorColor: string | null;
  readonly noticeFontColor: string | null;
  readonly noticeGlowColor: string | null;
  readonly noNoticeBadge: PreviewImage;
  readonly newNoticeBadge: PreviewImage;
}

export const describeInformationBar = (theme: ThemeSnapshot): InformationBarPreview => {
  const bar = theme.project.informationBar;

  return {
    barColor: cssColor(bar.barColor),
    indicatorColor: cssColor(bar.indicatorColor),
    noticeFontColor: cssColor(bar.noticeFontColor),
    noticeGlowColor: cssColor(bar.noticeGlowColor),
    noNoticeBadge: imageFor('Badge, no notifications', bar.noNoticeIcon, theme.assets),
    newNoticeBadge: imageFor('Badge, notification waiting', bar.newNoticeIcon, theme.assets),
  };
};

export interface PreviewBubble {
  readonly slot: HomeAppSlotId;
  readonly label: string;
  readonly icon: PreviewImage;
}

export interface HomeScreenPreview {
  readonly page: number;
  readonly pageCount: number;
  readonly background: PreviewImage;
  readonly bubbles: readonly PreviewBubble[];
  readonly labelColor: string | null;
  readonly labelShadow: boolean;
  readonly pageIndicator: PreviewImage;
  readonly currentPageIndicator: PreviewImage;
  readonly informationBar: InformationBarPreview;
  readonly hasBackgroundMusic: boolean;
}

/**
 * The home screen, as one of its LiveArea pages.
 *
 * A LiveArea page *is* a home screen page — the background, the label colour and the shadow
 * belong to the page, everything else is the same on all of them. Which page is being looked
 * at is the caller's business; a page that is not there falls back to the first.
 */
export const describeHomeScreen = (theme: ThemeSnapshot, page: number): HomeScreenPreview => {
  const { home } = theme.project;
  const index = page >= 0 && page < home.pages.length ? page : 0;
  const current = home.pages[index];

  return {
    page: index,
    pageCount: home.pages.length,
    background: imageFor('Page background', current?.background ?? null, theme.assets),
    bubbles: allHomeAppSlots().map((slot) => ({
      slot: slot.id,
      label: slot.label,
      icon: imageFor(slot.label, home.appIcons.get(slot.id) ?? null, theme.assets),
    })),
    labelColor: cssColor(current?.bubbleFontColor ?? null),
    labelShadow: current?.bubbleFontShadow ?? false,
    pageIndicator: imageFor('Page dot', home.basePageIndicator, theme.assets),
    currentPageIndicator: imageFor('Current page dot', home.currentPageIndicator, theme.assets),
    informationBar: describeInformationBar(theme),
    hasBackgroundMusic: home.backgroundMusic !== null,
  };
};

export type ClockCorner = 'lower-left' | 'upper-left' | 'lower-right';

export interface LockScreenPreview {
  readonly wallpaper: PreviewImage;
  readonly clockColor: string | null;
  readonly clock: {
    readonly corner: ClockCorner;
    /** What the theme asked for, and whether anybody has confirmed what it means. */
    readonly value: number | null;
    readonly documented: boolean;
  };
  readonly notification: {
    readonly background: string | null;
    readonly border: string | null;
    readonly font: string | null;
  };
  readonly informationBar: InformationBarPreview;
}

const CLOCK_CORNERS: Readonly<Record<number, ClockCorner>> = {
  0: 'lower-left',
  1: 'upper-left',
  2: 'lower-right',
};

/**
 * Where the clock is drawn.
 *
 * The three positions come from a single community source, which is why the format layer
 * grades them `community-reported`; the preview shows them and says so rather than treating
 * them as fact. A value nobody has documented is drawn where the console's own default would
 * be if the theme said nothing, because there is nothing better to do with it.
 */
const clockCorner = (layout: number | null): ClockCorner =>
  layout === null ? 'lower-left' : (CLOCK_CORNERS[layout] ?? 'lower-left');

export const isDocumentedClockPosition = (layout: number | null): boolean =>
  layout !== null && DATE_LAYOUT_OPTIONS.some((option) => option.value === layout);

export const CLOCK_POSITION_IS_CONFIRMED = DATE_LAYOUT_CONFIDENCE === 'verified';

export const describeLockScreen = (theme: ThemeSnapshot): LockScreenPreview => {
  const { startScreen } = theme.project;

  return {
    wallpaper: imageFor('Lock screen wallpaper', startScreen.background, theme.assets),
    clockColor: cssColor(startScreen.dateColor),
    clock: {
      corner: clockCorner(startScreen.dateLayout),
      value: startScreen.dateLayout,
      documented: isDocumentedClockPosition(startScreen.dateLayout),
    },
    notification: {
      background: cssColor(startScreen.notificationBackgroundColor),
      border: cssColor(startScreen.notificationBorderColor),
      font: cssColor(startScreen.notificationFontColor),
    },
    informationBar: describeInformationBar(theme),
  };
};

export interface ThemeListPreview {
  readonly title: string;
  readonly provider: string;
  readonly thumbnail: PreviewImage;
  readonly homePreview: PreviewImage;
  readonly startScreenPreview: PreviewImage;
  readonly pageThumbnails: readonly PreviewImage[];
}

/** What the console shows about a theme before it is applied: its name and its pictures. */
export const describeThemeList = (theme: ThemeSnapshot): ThemeListPreview => {
  const { metadata, home } = theme.project;

  return {
    title: metadata.title.defaultValue,
    provider: metadata.provider.defaultValue,
    thumbnail: imageFor('Theme thumbnail', metadata.packageThumbnail, theme.assets),
    homePreview: imageFor('Home screen preview', metadata.homePreview, theme.assets),
    startScreenPreview: imageFor('Lock screen preview', metadata.startScreenPreview, theme.assets),
    pageThumbnails: home.pages.map((page, index) =>
      imageFor(`Page ${String(index + 1)} thumbnail`, page.thumbnail, theme.assets),
    ),
  };
};

/** Colours are shown as the manifest writes them; this is only how they reach a stylesheet. */
export const previewColor = (color: ThemeColor | null): string | null => cssColor(color);
