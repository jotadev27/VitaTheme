import {
  MAX_COMPOSITION_LAYERS,
  MAX_SOURCE_PIXELS,
  MAX_SOURCE_SIDE,
  type ConvertedImage,
  type ImageConversionError,
} from '../../application/ports/image-converter';
import type { ImageConversionTarget } from '../../domain/editing/image-conversion';
import type {
  CompositionColor,
  CompositionRect,
  RasterComposition,
} from '../../domain/editing/preview-composition';
import { failure, success, type Result } from '../../domain/shared/result';
import {
  conversionError,
  decodeAndFit,
  encodeForTarget,
  errorMessage,
  resizeBitmap,
  type RawBitmap,
} from './jimp-pipeline';

/**
 * Drawing a composition.
 *
 * One pass down a list of layers onto a bitmap, then the same last steps every other theme
 * asset goes through. Nothing here decides what a preview looks like: the composition says
 * what to draw and where, and this draws it.
 *
 * The blending is written out rather than delegated because the result is an exported asset
 * and has to be the same every time: given the same layers, this produces the same bytes on
 * any machine, which is what lets a test assert on the picture rather than on the fact that
 * one was produced.
 *
 * A layer whose picture cannot be read is left out unless the composition says the preview is
 * not worth having without it — a wallpaper that will not decode is a refusal, an icon that
 * will not decode is one icon fewer.
 */

const CHANNELS = 4;
const OPAQUE = 0xff;

/** The part of a rectangle that is actually on the canvas. */
const clipped = (canvas: RawBitmap, rect: CompositionRect) => ({
  left: Math.max(rect.x, 0),
  top: Math.max(rect.y, 0),
  right: Math.min(rect.x + rect.width, canvas.width),
  bottom: Math.min(rect.y + rect.height, canvas.height),
});

/**
 * One pixel over another, with straight (not premultiplied) alpha.
 *
 * The usual "source over" operator, written for the general case even though the canvas under
 * a preview starts opaque: a layer that half-covers another has to look the same here as it
 * does anywhere else.
 */
const blendPixel = (pixels: Uint8Array, at: number, color: CompositionColor): void => {
  const sourceAlpha = color.alpha / OPAQUE;
  if (sourceAlpha <= 0) {
    return;
  }

  const destinationAlpha = (pixels[at + 3] ?? 0) / OPAQUE;
  const outAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  const mix = (source: number, destination: number): number =>
    Math.round(
      (source * sourceAlpha + destination * destinationAlpha * (1 - sourceAlpha)) / outAlpha,
    );

  pixels[at] = mix(color.red, pixels[at] ?? 0);
  pixels[at + 1] = mix(color.green, pixels[at + 1] ?? 0);
  pixels[at + 2] = mix(color.blue, pixels[at + 2] ?? 0);
  pixels[at + 3] = Math.round(outAlpha * OPAQUE);
};

const fillRect = (canvas: RawBitmap, rect: CompositionRect, color: CompositionColor): void => {
  const { left, top, right, bottom } = clipped(canvas, rect);

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      blendPixel(canvas.pixels, (y * canvas.width + x) * CHANNELS, color);
    }
  }
};

const drawBitmap = (canvas: RawBitmap, rect: CompositionRect, source: RawBitmap): void => {
  const { left, top, right, bottom } = clipped(canvas, rect);

  for (let y = top; y < bottom; y += 1) {
    const sourceY = y - rect.y;
    for (let x = left; x < right; x += 1) {
      const from = (sourceY * source.width + (x - rect.x)) * CHANNELS;
      blendPixel(canvas.pixels, (y * canvas.width + x) * CHANNELS, {
        red: source.pixels[from] ?? 0,
        green: source.pixels[from + 1] ?? 0,
        blue: source.pixels[from + 2] ?? 0,
        alpha: source.pixels[from + 3] ?? 0,
      });
    }
  }
};

const checkComposition = (composition: RasterComposition): Result<void, ImageConversionError> => {
  const { width, height, layers } = composition;

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_SOURCE_SIDE ||
    height > MAX_SOURCE_SIDE ||
    width * height > MAX_SOURCE_PIXELS
  ) {
    return conversionError('failed', 'That preview is not a size this application can draw.');
  }

  return layers.length > MAX_COMPOSITION_LAYERS
    ? conversionError('failed', 'That preview has more layers than this application will draw.')
    : success(undefined);
};

export const composeImage = async (
  composition: RasterComposition,
  target: ImageConversionTarget,
): Promise<Result<ConvertedImage, ImageConversionError>> => {
  const checked = checkComposition(composition);
  if (!checked.ok) {
    return failure(checked.error);
  }

  const canvas: RawBitmap = {
    width: composition.width,
    height: composition.height,
    pixels: new Uint8Array(composition.width * composition.height * CHANNELS),
  };

  try {
    for (const layer of composition.layers) {
      if (layer.kind === 'fill') {
        fillRect(canvas, layer.rect, layer.color);
        continue;
      }

      const fitted = await decodeAndFit(
        layer.image,
        layer.rect.width,
        layer.rect.height,
        layer.fit,
      );
      if (!fitted.ok) {
        // The picture the preview is of, or one of the things on it: only the first is worth
        // stopping for.
        if (layer.required) {
          return failure(fitted.error);
        }
        continue;
      }

      drawBitmap(canvas, layer.rect, fitted.value);
    }

    // The screen previews are drawn in the console's own pixels and written at half of them,
    // which is the one place a preview changes size. Compositions are built to their target's
    // proportions, so nothing is distorted by this.
    const drawn =
      canvas.width === target.width && canvas.height === target.height
        ? canvas
        : resizeBitmap(canvas, target.width, target.height);

    return await encodeForTarget(drawn, target);
  } catch (error) {
    return conversionError('failed', `The preview could not be drawn: ${errorMessage(error)}.`);
  }
};
