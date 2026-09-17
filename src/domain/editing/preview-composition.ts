import type { ThemeAssetPath } from '../model/theme-asset-path';
import type { ThemeColor } from '../model/theme-color';
import { themedSystemIcons } from './system-icon-defaults';
import type { ThemeProject } from '../model/theme-project';
import { failure, success, type Result } from '../shared/result';
import { imageAssetSpec } from '../vita/asset-specs';
import {
  VITA_INFORMATION_BAR_HEIGHT,
  VITA_SCREEN_HEIGHT,
  VITA_SCREEN_WIDTH,
  VITA_WALLPAPER_HEIGHT,
} from '../vita/display';
import type { ThemePreviewKind } from '../vita/theme-previews';
import { DEFAULT_IMAGE_FIT, type ImageFit } from './image-conversion';

/**
 * What a generated preview is a picture of.
 *
 * A composition is a flat list of things to draw, in order, on a canvas the size of the thing
 * being drawn — the console's screen for the two screen previews, the thumbnail itself for
 * the third. It holds no pixels: an image layer names a file the theme already refers to, and
 * whatever turns that into bytes lives outside the domain.
 *
 * ## What is drawn, and what is not
 *
 * Everything here is the theme's own: its wallpapers, its icons, its page dots, its colours.
 * Nothing stands in for the console's own artwork, and nothing is invented —
 *
 * - **the system icons a theme does not replace** are left out, not drawn as a placeholder.
 *   The console draws its own there, and a picture that showed VitaTheme's neutral marks
 *   instead would be telling somebody browsing themes that the theme replaces an icon it
 *   does not. The editor draws those marks on screen, where they mean "not themed"; an
 *   exported preview has no way of saying that, so it says nothing.
 * - **text is not drawn at all** — not the labels under the bubbles, not the clock, not the
 *   date. Those are the console's own text in the console's own font. Faking them would put
 *   made-up words into a picture the console will show as a description of the theme, and
 *   VitaTheme has no font it can honestly draw them with. `m_fontColor` and `m_dateColor`
 *   are therefore not represented in a generated preview; the editor's live preview is where
 *   those are judged.
 * - **the status icons in the information bar** are the console's, so `m_indicatorColor`,
 *   `m_noticeFontColor` and `m_noticeGlowColor` colour nothing here. `m_barColor` does: it
 *   is the strip itself.
 * - **the lock screen's notification panel** is not drawn either, for the same reason and one
 *   more: the console shows it only when there *is* a notification, and it is mostly the text
 *   in it. An empty coloured rectangle on a picture the console offers as a description of
 *   the theme would look like a fault in the theme. `m_notifyBgColor`, `m_notifyBorderColor`
 *   and `m_notifyFontColor` are shown in the editor instead, over the same wallpaper.
 *
 * ## What is approximate
 *
 * The **sizes** are the format's own and are exact: a wallpaper is 960x512 under a 32-pixel
 * information bar, an icon is 128x128, a page dot is 22x22, and the two screen previews are
 * that screen at half scale — which is how the one published theme measured for
 * `docs/ps-vita-theme-format.md` composes its own.
 *
 * The **arrangement** of the icons and dots is VitaTheme's, not Sony's. Nothing documents how
 * many bubbles a page holds or where they sit, and the arrangement belongs to the console
 * rather than to the theme. The grid below is a stand-in of the same shape the editor's live
 * preview uses, and `docs/preview-generation.md` says so plainly.
 */

export interface CompositionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Straight (not premultiplied) RGBA, each channel 0-255. */
export interface CompositionColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

export type CompositionLayer<TImage> =
  | { readonly kind: 'fill'; readonly rect: CompositionRect; readonly color: CompositionColor }
  | {
      readonly kind: 'image';
      readonly rect: CompositionRect;
      readonly image: TImage;
      readonly fit: ImageFit;
      /**
       * Whether the picture is the point of the preview.
       *
       * A wallpaper that cannot be read leaves nothing worth exporting, so the preview is
       * refused. An icon that cannot be read leaves a preview that is still a picture of the
       * theme, so it is left out and the rest is drawn.
       */
      readonly required: boolean;
    };

export interface Composition<TImage> {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly CompositionLayer<TImage>[];
}

/** A composition as the domain describes it: images are files the theme already refers to. */
export type PreviewComposition = Composition<ThemeAssetPath>;

/** The same composition once somebody has read those files. */
export type RasterComposition = Composition<Uint8Array>;

export type PreviewCompositionError =
  /** The first LiveArea page has no background, so there is no home screen to draw. */
  | 'no-home-artwork'
  /** The start screen has no wallpaper. */
  | 'no-lock-screen-artwork'
  /** The theme has no artwork at all to make a thumbnail from. */
  | 'no-artwork';

const OPAQUE = 0xff;

const BLACK: CompositionColor = { red: 0, green: 0, blue: 0, alpha: OPAQUE };

const fill = (rect: CompositionRect, color: CompositionColor): CompositionLayer<never> => ({
  kind: 'fill',
  rect,
  color,
});

const picture = <TImage>(
  rect: CompositionRect,
  image: TImage,
  required: boolean,
): CompositionLayer<TImage> => ({ kind: 'image', rect, image, fit: DEFAULT_IMAGE_FIT, required });

/** A theme's colour as something to draw with. The notation it was written in is irrelevant here. */
const asCompositionColor = (color: ThemeColor): CompositionColor => ({
  red: color.red,
  green: color.green,
  blue: color.blue,
  alpha: color.alpha,
});

/**
 * VitaTheme's arrangement of a home screen.
 *
 * Six columns is what fits an icon and a comfortable gap across 960 pixels, and three rows
 * hold the seventeen slots the format has. None of it is documented behaviour of the console
 * — see the note at the top of this file.
 */
const ICON_SIZE = imageAssetSpec('appIcon').width;
const ICON_COLUMNS = 6;
const ICON_MARGIN_X = 32;
const ICON_TOP = 64;
const ICON_ROW_PITCH = ICON_SIZE + 28;
const ICON_COLUMN_PITCH = (VITA_SCREEN_WIDTH - 2 * ICON_MARGIN_X) / ICON_COLUMNS;

const PAGE_DOT_SIZE = imageAssetSpec('pageIndicator').width;
const PAGE_DOT_GAP = 10;
const PAGE_DOT_BOTTOM_MARGIN = 14;

const wallpaperRect = (): CompositionRect => ({
  x: 0,
  y: VITA_INFORMATION_BAR_HEIGHT,
  width: VITA_SCREEN_WIDTH,
  height: VITA_WALLPAPER_HEIGHT,
});

const informationBarRect = (): CompositionRect => ({
  x: 0,
  y: 0,
  width: VITA_SCREEN_WIDTH,
  height: VITA_INFORMATION_BAR_HEIGHT,
});

/**
 * The screen, before anything of the theme is on it.
 *
 * Black, because that is what the console composites a theme's own artwork over, and because
 * the alternative — guessing at the console's default bar — would be inventing a fact about
 * hardware nobody here has measured.
 */
const screenBase = (): CompositionLayer<never>[] => [
  fill({ x: 0, y: 0, width: VITA_SCREEN_WIDTH, height: VITA_SCREEN_HEIGHT }, BLACK),
];

const informationBarLayers = (project: ThemeProject): CompositionLayer<never>[] => {
  const { barColor } = project.informationBar;
  return barColor === null ? [] : [fill(informationBarRect(), asCompositionColor(barColor))];
};

const iconLayers = (project: ThemeProject): CompositionLayer<ThemeAssetPath>[] =>
  themedSystemIcons(project).flatMap((slot, position) => {
    const path = project.home.appIcons.get(slot);
    if (path === undefined) {
      return [];
    }

    const column = position % ICON_COLUMNS;
    const row = Math.floor(position / ICON_COLUMNS);

    return [
      picture(
        {
          x: Math.round(
            ICON_MARGIN_X + column * ICON_COLUMN_PITCH + (ICON_COLUMN_PITCH - ICON_SIZE) / 2,
          ),
          y: ICON_TOP + row * ICON_ROW_PITCH,
          width: ICON_SIZE,
          height: ICON_SIZE,
        },
        path,
        false,
      ),
    ];
  });

/**
 * The page indicator: one dot per LiveArea page, the current one drawn differently.
 *
 * Sony's manual establishes what it means — "the dot for the current page is white" — and the
 * theme supplies both pictures. A theme that supplies neither gets no dots rather than dots
 * VitaTheme drew: the console draws its own, and this is a picture of the theme.
 */
const pageIndicatorLayers = (project: ThemeProject): CompositionLayer<ThemeAssetPath>[] => {
  const { pages, basePageIndicator, currentPageIndicator } = project.home;
  const count = pages.length;
  const totalWidth = count * PAGE_DOT_SIZE + (count - 1) * PAGE_DOT_GAP;
  const left = Math.round((VITA_SCREEN_WIDTH - totalWidth) / 2);
  const top = VITA_SCREEN_HEIGHT - PAGE_DOT_BOTTOM_MARGIN - PAGE_DOT_SIZE;

  return pages.flatMap((_page, index) => {
    const dot = index === 0 ? currentPageIndicator : basePageIndicator;
    if (dot === null) {
      return [];
    }

    return [
      picture(
        {
          x: left + index * (PAGE_DOT_SIZE + PAGE_DOT_GAP),
          y: top,
          width: PAGE_DOT_SIZE,
          height: PAGE_DOT_SIZE,
        },
        dot,
        false,
      ),
    ];
  });
};

/**
 * The artwork a thumbnail is made from.
 *
 * The first LiveArea page's background is the theme's face, and is what the published theme
 * measured for this project uses. A theme that styles only the lock screen falls back to
 * that, because a thumbnail of the one picture it does have is better than none.
 */
const thumbnailArtwork = (project: ThemeProject): ThemeAssetPath | null =>
  project.home.pages[0]?.background ?? project.startScreen.background;

const homePreviewComposition = (
  project: ThemeProject,
): Result<PreviewComposition, PreviewCompositionError> => {
  const background = project.home.pages[0]?.background ?? null;
  if (background === null) {
    return failure('no-home-artwork');
  }

  return success({
    width: VITA_SCREEN_WIDTH,
    height: VITA_SCREEN_HEIGHT,
    layers: [
      ...screenBase(),
      picture(wallpaperRect(), background, true),
      ...informationBarLayers(project),
      ...iconLayers(project),
      ...pageIndicatorLayers(project),
    ],
  });
};

const startScreenPreviewComposition = (
  project: ThemeProject,
): Result<PreviewComposition, PreviewCompositionError> => {
  const background = project.startScreen.background;
  if (background === null) {
    return failure('no-lock-screen-artwork');
  }

  return success({
    width: VITA_SCREEN_WIDTH,
    height: VITA_SCREEN_HEIGHT,
    layers: [
      ...screenBase(),
      picture(wallpaperRect(), background, true),
      ...informationBarLayers(project),
    ],
  });
};

const packageThumbnailComposition = (
  project: ThemeProject,
): Result<PreviewComposition, PreviewCompositionError> => {
  const artwork = thumbnailArtwork(project);
  if (artwork === null) {
    return failure('no-artwork');
  }

  const spec = imageAssetSpec('packageThumbnail');
  const rect = { x: 0, y: 0, width: spec.width, height: spec.height };

  return success({
    width: spec.width,
    height: spec.height,
    // Filled from the centre outwards, keeping the artwork's proportions and cropping what
    // hangs over. A thumbnail is not the shape of a wallpaper, and pulling one into the
    // other would show somebody a distorted version of their own picture.
    layers: [fill(rect, BLACK), picture(rect, artwork, true)],
  });
};

export const previewComposition = (
  kind: ThemePreviewKind,
  project: ThemeProject,
): Result<PreviewComposition, PreviewCompositionError> => {
  switch (kind) {
    case 'homePreview':
      return homePreviewComposition(project);
    case 'startScreenPreview':
      return startScreenPreviewComposition(project);
    case 'packageThumbnail':
      return packageThumbnailComposition(project);
  }
};

/** Every file a composition draws, once each, in the order it draws them. */
export const compositionImages = (composition: PreviewComposition): readonly ThemeAssetPath[] => [
  ...new Set(composition.layers.flatMap((layer) => (layer.kind === 'image' ? [layer.image] : []))),
];
