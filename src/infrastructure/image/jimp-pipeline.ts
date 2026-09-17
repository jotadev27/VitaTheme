import { Jimp } from 'jimp';
import {
  MAX_SOURCE_PIXELS,
  MAX_SOURCE_SIDE,
  type ConvertedImage,
  type ImageConversionError,
  type ImageConversionErrorCode,
} from '../../application/ports/image-converter';
import type { ImageConversionTarget, ImageFit } from '../../domain/editing/image-conversion';
import { failure, success, type Result } from '../../domain/shared/result';
import { identifyMedia } from '../media/media-probe';
import { encodeIndexedPng } from './indexed-png';

/**
 * Pictures, with Jimp.
 *
 * Jimp was chosen because it is pure JavaScript. The alternative worth taking seriously was
 * a native library, which decodes faster and quantises better — and which would mean
 * shipping a compiled binary for every platform beside the application, rebuilt against each
 * Electron release, unpacked out of the archive at runtime. This project packages itself as
 * one self-contained bundle with nothing beside it, and work somebody runs a handful of
 * times per theme does not justify giving that up.
 *
 * What Jimp does not do is write a palette PNG — no maintained pure-JavaScript library does
 * — so the last step is this repository's own encoder, over pixels Jimp has already reduced
 * to a palette's worth of colours.
 *
 * This module is what converting one picture and drawing several of them have in common, and
 * it is the only place that names the library. What crosses its boundary is a `RawBitmap`:
 * plain pixels, which everything else in this folder can reason about, blend and compare
 * without knowing what decoded them.
 */

/** Four bytes per pixel, row by row, top to bottom — the one currency in this folder. */
export interface RawBitmap {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

const CHANNELS = 4;

/**
 * How the palette is chosen, and how the picture is mapped onto it.
 *
 * Measured over a 960x512 wallpaper on this project's own fixtures: Wu's algorithm takes
 * about 0.8 s where the library's default takes 2.3 s, and produces a palette of the same
 * quality. Floyd–Steinberg then costs another 0.2 s and is what keeps a photographic
 * gradient from banding into stripes once it has only 256 colours to work with.
 */
const PALETTE_ALGORITHM = 'wuquant';
const PIXEL_MAPPING = 'floyd-steinberg';

export const conversionError = (
  code: ImageConversionErrorCode,
  message: string,
): Result<never, ImageConversionError> => failure({ code, message });

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'the image could not be read';

/**
 * What the file says it is, before anything decodes it.
 *
 * A decoder allocates from the dimensions in the header, so the header is where an image
 * built to exhaust memory has to be caught — after decoding is far too late.
 */
export const checkDecodable = (source: Uint8Array): Result<void, ImageConversionError> => {
  const media = identifyMedia(source);

  if (media.kind !== 'image') {
    return conversionError(
      'not-an-image',
      'That file is not an image this application can read, so there is nothing to convert.',
    );
  }

  if (media.width > MAX_SOURCE_SIDE || media.height > MAX_SOURCE_SIDE) {
    return conversionError(
      'too-large',
      `That image is ${String(media.width)}x${String(media.height)} pixels, which is larger ` +
        'than this application will open. Scale it down first.',
    );
  }

  if (media.width * media.height > MAX_SOURCE_PIXELS) {
    return conversionError(
      'too-large',
      `That image holds ${String(Math.round((media.width * media.height) / 1_000_000))} million ` +
        'pixels, which is more than this application will decode at once. Scale it down first.',
    );
  }

  return success(undefined);
};

/** A picture the library is holding, from pixels this application already has. */
const loaded = (bitmap: RawBitmap) => {
  const image = new Jimp({ width: bitmap.width, height: bitmap.height });
  image.bitmap.data.set(bitmap.pixels);
  return image;
};

const raw = (image: {
  bitmap: { width: number; height: number; data: Uint8Array };
}): RawBitmap => ({
  width: image.bitmap.width,
  height: image.bitmap.height,
  pixels: new Uint8Array(image.bitmap.data),
});

/**
 * Reads an untrusted picture and makes it the shape it has to be, in one step.
 *
 * The two are together because they are the only two things the library is needed for on the
 * way in, and doing them in one place is what keeps its types out of everything else.
 */
export const decodeAndFit = async (
  source: Uint8Array,
  width: number,
  height: number,
  fit: ImageFit,
): Promise<Result<RawBitmap, ImageConversionError>> => {
  const decodable = checkDecodable(source);
  if (!decodable.ok) {
    return failure(decodable.error);
  }

  let image;
  try {
    image = await Jimp.fromBuffer(Buffer.from(source));
  } catch (error) {
    return conversionError('undecodable', `That image could not be read: ${errorMessage(error)}.`);
  }

  try {
    const size = { w: width, h: height };
    switch (fit) {
      case 'cover':
        image.cover(size);
        break;
      case 'contain':
        image.contain(size);
        break;
      case 'stretch':
        image.resize(size);
        break;
    }

    return success(raw(image));
  } catch (error) {
    return conversionError('failed', `The image could not be resized: ${errorMessage(error)}.`);
  }
};

/** Scales a picture this application drew. Nothing about it is untrusted. */
export const resizeBitmap = (bitmap: RawBitmap, width: number, height: number): RawBitmap => {
  const image = loaded(bitmap);
  image.resize({ w: width, h: height });
  return raw(image);
};

/**
 * Lays transparency over black.
 *
 * The console composites an asset with no transparency over black, so doing the same here
 * shows the author now what the hardware would show them later. Done over the pixels rather
 * than by compositing onto a second image: one pass, with no dependency on how a library
 * chooses to blend.
 */
export const flattenOntoBlack = (pixels: Uint8Array): void => {
  for (let at = 0; at < pixels.length; at += CHANNELS) {
    const alpha = pixels[at + 3] ?? 0;
    if (alpha === 0xff) {
      continue;
    }

    pixels[at] = Math.round(((pixels[at] ?? 0) * alpha) / 0xff);
    pixels[at + 1] = Math.round(((pixels[at + 1] ?? 0) * alpha) / 0xff);
    pixels[at + 2] = Math.round(((pixels[at + 2] ?? 0) * alpha) / 0xff);
    pixels[at + 3] = 0xff;
  }
};

/** What was produced, identified the way every other file in the application is. */
const described = (bytes: Uint8Array): Result<ConvertedImage, ImageConversionError> => {
  const media = identifyMedia(bytes);

  return media.kind === 'image'
    ? success({ bytes, inspected: { byteSize: bytes.byteLength, media } })
    : conversionError('failed', 'The converted image could not be read back, so it was not used.');
};

/**
 * The last steps: flatten what the slot has no transparency for, reduce to a palette when the
 * slot is written as one, and write the file. The bitmap it is given is left as it was.
 */
export const encodeForTarget = async (
  bitmap: RawBitmap,
  target: ImageConversionTarget,
): Promise<Result<ConvertedImage, ImageConversionError>> => {
  const pixels = new Uint8Array(bitmap.pixels);
  if (target.flatten) {
    flattenOntoBlack(pixels);
  }

  const image = loaded({ ...bitmap, pixels });

  if (target.maxColors === null) {
    // Jimp writes eight-bit truecolour with alpha, which is what an asset that may be
    // transparent needs and what the validator asks nothing more of.
    const encoded = await image.getBuffer('image/png');
    return described(new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength));
  }

  image.quantize({
    colors: target.maxColors,
    paletteQuantization: PALETTE_ALGORITHM,
    imageQuantization: PIXEL_MAPPING,
  });
  const encoded = encodeIndexedPng({
    width: image.bitmap.width,
    height: image.bitmap.height,
    pixels: image.bitmap.data,
  });

  return encoded.ok
    ? described(encoded.value)
    : conversionError(
        'failed',
        'The image could not be reduced to a palette small enough for a theme asset.',
      );
};
