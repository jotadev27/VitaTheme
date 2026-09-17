import { VITA_WALLPAPER_HEIGHT, VITA_WALLPAPER_WIDTH } from './display';

/**
 * How well a rule is established.
 *
 * The PS Vita theme format was never published by Sony, so parts of it are only known
 * through community documentation. Rules are graded so the validator can report a firm
 * error where the format is certain and a warning where it is not, instead of rejecting
 * themes on the strength of a single unconfirmed source.
 *
 * See `docs/ps-vita-theme-format.md` for the sources behind every rule in this module.
 */
export type SpecConfidence =
  /** Agreed on by community documentation and confirmed against a working theme. */
  | 'verified'
  /** Documented by the community but not confirmed, or sources disagree. */
  | 'community-reported';

export type TransparencySupport = 'supported' | 'unsupported';

export const THEME_IMAGE_ASSET_KINDS = [
  'liveAreaBackground',
  'liveAreaThumbnail',
  'startScreenBackground',
  'appIcon',
  'pageIndicator',
  'notificationBadge',
  'homePreview',
  'startScreenPreview',
  'packageThumbnail',
] as const;

export type ThemeImageAssetKind = (typeof THEME_IMAGE_ASSET_KINDS)[number];

export interface ThemeImageAssetSpec {
  readonly kind: ThemeImageAssetKind;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly transparency: TransparencySupport;
  readonly dimensionsConfidence: SpecConfidence;
}

/** The only image container the PS Vita reads from a theme. */
export const REQUIRED_IMAGE_FORMAT = 'png';

/**
 * Themes are authored as 8-bit PNGs. A higher bit depth is not known to be supported and
 * only inflates the package, so it is reported rather than silently accepted.
 */
export const MAX_IMAGE_BIT_DEPTH = 8;

/**
 * Opaque assets are conventionally saved as indexed ("PNG-8") images. This is a size and
 * compatibility recommendation, not a hard requirement: truecolour PNGs are known to work.
 */
export const RECOMMENDED_OPAQUE_COLOR_MODEL = 'indexed';

const SPECS: Readonly<Record<ThemeImageAssetKind, ThemeImageAssetSpec>> = {
  liveAreaBackground: {
    kind: 'liveAreaBackground',
    label: 'LiveArea page background',
    width: VITA_WALLPAPER_WIDTH,
    height: VITA_WALLPAPER_HEIGHT,
    transparency: 'unsupported',
    dimensionsConfidence: 'verified',
  },
  liveAreaThumbnail: {
    kind: 'liveAreaThumbnail',
    label: 'LiveArea page thumbnail',
    width: 360,
    height: 192,
    transparency: 'unsupported',
    dimensionsConfidence: 'community-reported',
  },
  startScreenBackground: {
    kind: 'startScreenBackground',
    label: 'Start screen (lock screen) background',
    width: VITA_WALLPAPER_WIDTH,
    height: VITA_WALLPAPER_HEIGHT,
    transparency: 'unsupported',
    dimensionsConfidence: 'verified',
  },
  appIcon: {
    kind: 'appIcon',
    label: 'System application icon',
    width: 128,
    height: 128,
    transparency: 'supported',
    dimensionsConfidence: 'verified',
  },
  pageIndicator: {
    kind: 'pageIndicator',
    label: 'Page indicator dot',
    width: 22,
    height: 22,
    transparency: 'supported',
    dimensionsConfidence: 'verified',
  },
  notificationBadge: {
    kind: 'notificationBadge',
    label: 'Notification badge',
    width: 120,
    height: 110,
    transparency: 'supported',
    dimensionsConfidence: 'verified',
  },
  /**
   * 480×272, not the 320×181 one tutorial gives.
   *
   * The sources disagree, so this follows the two that can be checked: the community
   * repository's own validator reports 320×181 as wrong and names 480×272, and a published
   * working theme ships both previews at 480×272. The tutorial's figure is recorded in
   * docs/ps-vita-theme-format.md rather than dropped, and the confidence stays
   * community-reported — nobody has confirmed what the console does with either.
   */
  homePreview: {
    kind: 'homePreview',
    label: 'Home screen preview',
    width: 480,
    height: 272,
    transparency: 'unsupported',
    dimensionsConfidence: 'community-reported',
  },
  startScreenPreview: {
    kind: 'startScreenPreview',
    label: 'Start screen preview',
    width: 480,
    height: 272,
    transparency: 'unsupported',
    dimensionsConfidence: 'community-reported',
  },
  packageThumbnail: {
    kind: 'packageThumbnail',
    label: 'Theme thumbnail',
    width: 226,
    height: 128,
    transparency: 'unsupported',
    dimensionsConfidence: 'community-reported',
  },
};

export const imageAssetSpec = (kind: ThemeImageAssetKind): ThemeImageAssetSpec => SPECS[kind];

export const allImageAssetSpecs = (): readonly ThemeImageAssetSpec[] =>
  THEME_IMAGE_ASSET_KINDS.map(imageAssetSpec);
