import type { ImageColorModel, MediaDescriptor } from '../model/media';
import {
  imageAssetSpec,
  MAX_IMAGE_BIT_DEPTH,
  RECOMMENDED_OPAQUE_COLOR_MODEL,
  REQUIRED_IMAGE_FORMAT,
  type ThemeImageAssetKind,
} from '../vita/asset-specs';

/**
 * What a picture has to become to sit in a theme, and whether it already has.
 *
 * Nothing here touches an image: it decides what the result must be, from the same
 * specifications the validator checks against. The two cannot drift apart, because the
 * target is derived from the spec rather than written down again — a converted asset that
 * did not satisfy the validator would mean this file and the validator disagreed about the
 * same `ThemeImageAssetSpec`, which they cannot.
 *
 * No PS Vita rule is invented here. Every value comes from `asset-specs.ts`, and the one
 * judgement this file makes — composing transparency over black for an asset that has none
 * — is what the validator already tells the author the console does.
 */

/** How a picture of the wrong shape is made to fit one of the right shape. */
export type ImageFit =
  /** Fills the target and crops whatever hangs over. Keeps the picture's proportions. */
  | 'cover'
  /** Fits the whole picture inside the target, padding the rest. Keeps its proportions. */
  | 'contain'
  /** Pulls the picture to the target's proportions. Distorts it, and sometimes that is wanted. */
  | 'stretch';

export const IMAGE_FITS: readonly ImageFit[] = ['cover', 'contain', 'stretch'];

/**
 * What a conversion does when nothing else is asked for.
 *
 * Filling the slot is almost always what somebody means by "make this my wallpaper", and it
 * is the only option that leaves no invented pixels in the result.
 */
export const DEFAULT_IMAGE_FIT: ImageFit = 'cover';

/** The most colours a palette PNG can hold, which is what "indexed" means in this format. */
export const MAX_PALETTE_COLORS = 256;

export interface ImageConversionTarget {
  readonly width: number;
  readonly height: number;
  readonly format: typeof REQUIRED_IMAGE_FORMAT;
  readonly colorModel: ImageColorModel;
  readonly bitDepth: number;
  /**
   * Whether transparency is composed away before the picture is written.
   *
   * For an asset the format has no transparency for, the console composites what it is given
   * over black. Doing the same here means what the author sees in the editor is what the
   * console will show, rather than a surprise on the hardware.
   */
  readonly flatten: boolean;
  /** Set when the result is a palette image; the most colours that palette may hold. */
  readonly maxColors: number | null;
}

/**
 * What a picture has to become for this slot.
 *
 * Opaque assets follow the indexed convention the validator recommends. Assets that may be
 * transparent keep a full alpha channel instead: reducing those to a palette would risk the
 * one thing that must not be lost, and the validator asks nothing of their colour model.
 */
export const imageConversionTarget = (kind: ThemeImageAssetKind): ImageConversionTarget => {
  const spec = imageAssetSpec(kind);
  const opaque = spec.transparency === 'unsupported';

  return {
    width: spec.width,
    height: spec.height,
    format: REQUIRED_IMAGE_FORMAT,
    colorModel: opaque ? RECOMMENDED_OPAQUE_COLOR_MODEL : 'truecolor-alpha',
    bitDepth: MAX_IMAGE_BIT_DEPTH,
    flatten: opaque,
    maxColors: opaque ? MAX_PALETTE_COLORS : null,
  };
};

/**
 * Whether converting would produce anything different from what is already there.
 *
 * This is the question a "Convert" button asks, and it is deliberately not the question the
 * validator asks: a file can be perfectly valid and still be worth converting, and a file
 * can be invalid in ways no conversion addresses. Comparing what is there with what the
 * conversion would produce is the honest test of whether there is anything to do.
 */
export const imageConversionWouldChange = (
  target: ImageConversionTarget,
  media: MediaDescriptor,
): boolean => {
  if (media.kind !== 'image') {
    return true;
  }

  if (
    media.format !== target.format ||
    media.width !== target.width ||
    media.height !== target.height
  ) {
    return true;
  }

  const encoding = media.encoding;
  if (encoding === null) {
    return true;
  }

  return (
    encoding.bitDepth !== target.bitDepth ||
    encoding.colorModel !== target.colorModel ||
    (target.flatten && encoding.hasTransparency)
  );
};

/** Whether a file is the sort of thing that can be converted at all. */
export const isConvertibleImage = (media: MediaDescriptor): boolean => media.kind === 'image';
