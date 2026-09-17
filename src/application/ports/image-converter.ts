import type { ImageConversionTarget, ImageFit } from '../../domain/editing/image-conversion';
import type { RasterComposition } from '../../domain/editing/preview-composition';
import type { InspectedAsset } from '../../domain/model/media';
import type { Result } from '../../domain/shared/result';

/**
 * Turning a picture into one a theme can use.
 *
 * The application decides *what* the result has to be — the domain works that out from the
 * asset's specification — and this port is asked to produce it. Nothing here knows about
 * slots, themes or files: it is handed bytes and told what they must become.
 *
 * The bytes are untrusted. An implementation decodes them only after checking what they
 * claim to be, and only within the limits below, so that a file built to be expensive to
 * decode is refused rather than decoded.
 */

/**
 * The most pixels an implementation may decode.
 *
 * A decoder allocates four bytes per pixel whatever the file's size on disk, so a small,
 * highly compressed file can still ask for gigabytes. Theme assets are at most 960x544, so
 * this ceiling is far above anything that will be converted in earnest; it exists to refuse
 * the file that was never a picture somebody meant to use.
 */
export const MAX_SOURCE_PIXELS = 32 * 1_000_000;

/** A guard against an image whose area is modest but whose rows are absurd. */
export const MAX_SOURCE_SIDE = 16_384;

/**
 * The most layers a composition may hold.
 *
 * Far above what a preview of a PS Vita screen needs — a full home screen is thirty — and
 * here for the same reason as the limits above: this port is a boundary, and a boundary
 * states what it will do rather than trusting what it is handed.
 */
export const MAX_COMPOSITION_LAYERS = 64;

export type ImageConversionErrorCode =
  /** The file is not an image, or not one this application can read. */
  | 'not-an-image'
  /** The bytes claim to be an image but could not be decoded. */
  | 'undecodable'
  /** Larger than the application is willing to decode. */
  | 'too-large'
  /** The conversion itself failed; the source is unchanged. */
  | 'failed';

export interface ImageConversionError {
  readonly code: ImageConversionErrorCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

export interface ConvertedImage {
  readonly bytes: Uint8Array;
  /**
   * What the result turned out to be, read back from the bytes that were written.
   *
   * Described rather than asserted: the implementation identifies its own output the same
   * way the application identifies any other file, so a conversion that produced something
   * unreadable says so here instead of being discovered later by the validator.
   */
  readonly inspected: InspectedAsset;
}

export interface ImageConverter {
  /**
   * Produces a PNG matching `target` exactly, or explains why it could not.
   *
   * The result is bytes, not a file: what it becomes — where it is kept, what it is called,
   * whether it is any good — is not this port's business.
   */
  convert(
    source: Uint8Array,
    target: ImageConversionTarget,
    fit: ImageFit,
  ): Promise<Result<ConvertedImage, ImageConversionError>>;

  /**
   * Draws a composition and produces a PNG matching `target`, the same way `convert` does.
   *
   * The composition arrives with every picture already read, and decides everything about
   * what the result looks like; this is asked only to draw it. A layer's bytes are as
   * untrusted as a file somebody chose, and go through the same checks before anything
   * decodes them.
   */
  compose(
    composition: RasterComposition,
    target: ImageConversionTarget,
  ): Promise<Result<ConvertedImage, ImageConversionError>>;
}
