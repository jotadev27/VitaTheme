import { deflateSync } from 'node:zlib';
import { failure, success, type Result } from '../../domain/shared/result';
import { crc32 } from '../archive/crc32';

/**
 * Writing a palette PNG.
 *
 * This exists because no maintained pure-JavaScript library writes one. `pngjs`, which every
 * candidate decoder is built on, refuses colour type 3 outright — "not supported at present"
 * — and the one library that does write palette images has not been touched since 2022 and
 * ships no types. The alternative was a native image library, which would mean shipping
 * platform binaries beside the application and giving up the single self-contained package
 * this project deliberately produces.
 *
 * What is written here is the narrowest possible slice of the format: colour type 3, eight
 * bits per pixel, one `IDAT`, no interlacing, no ancillary chunks beyond the transparency
 * table. Palette PNGs of exactly this shape are what theme assets have always been, and the
 * result is read back through this project's own image identification before it is used, so
 * nothing written here is taken on trust.
 *
 * Deterministic: the palette is ordered by colour, so the same pixels always produce the
 * same file.
 */

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const BIT_DEPTH = 8;
const COLOR_TYPE_INDEXED = 3;
const FILTER_NONE = 0;
const CHANNELS = 4;

/** A palette index is one byte, so a palette holds at most this many colours. */
const MAX_PALETTE_ENTRIES = 256;

export type IndexedPngError =
  /** More distinct colours than a palette can hold: the caller must reduce them first. */
  'too-many-colors' | 'empty-image';

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Four bytes per pixel, row by row, top to bottom. */
  readonly pixels: Uint8Array;
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const body = new Uint8Array(4 + data.length);
  body.set(new TextEncoder().encode(type), 0);
  body.set(data, 4);

  const framed = new Uint8Array(4 + body.length + 4);
  const view = new DataView(framed.buffer);
  view.setUint32(0, data.length);
  framed.set(body, 4);
  view.setUint32(4 + body.length, crc32(body));

  return framed;
};

const header = (width: number, height: number): Uint8Array => {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = BIT_DEPTH;
  data[9] = COLOR_TYPE_INDEXED;
  // Compression 0, filter 0, interlace 0: the only values the format defines, and the only
  // ones anything reading a theme asset expects.
  return data;
};

/**
 * The colours in the image, in a fixed order, with the pixels rewritten as indices into it.
 *
 * Ordering by packed colour rather than by first appearance is what makes the output
 * deterministic: two images with the same pixels produce the same palette whatever order the
 * pixels happen to be in.
 */
const paletteOf = (
  image: RgbaImage,
): Result<{ colors: readonly number[]; indices: Uint8Array }, IndexedPngError> => {
  const pixelCount = image.width * image.height;
  const distinct = new Set<number>();

  for (let at = 0; at < pixelCount * CHANNELS; at += CHANNELS) {
    const packed =
      (((image.pixels[at] ?? 0) << 24) |
        ((image.pixels[at + 1] ?? 0) << 16) |
        ((image.pixels[at + 2] ?? 0) << 8) |
        (image.pixels[at + 3] ?? 0)) >>>
      0;

    distinct.add(packed);
    if (distinct.size > MAX_PALETTE_ENTRIES) {
      return failure('too-many-colors');
    }
  }

  const colors = [...distinct].sort((left, right) => left - right);
  const indexOf = new Map(colors.map((color, index) => [color, index] as const));

  const indices = new Uint8Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const at = pixel * CHANNELS;
    const packed =
      (((image.pixels[at] ?? 0) << 24) |
        ((image.pixels[at + 1] ?? 0) << 16) |
        ((image.pixels[at + 2] ?? 0) << 8) |
        (image.pixels[at + 3] ?? 0)) >>>
      0;
    indices[pixel] = indexOf.get(packed) ?? 0;
  }

  return success({ colors, indices });
};

/**
 * The transparency table, which is only written when some colour needs it.
 *
 * It covers the palette up to the last colour that is not fully opaque; everything after
 * that is opaque by definition, which is what the format says a shorter table means.
 */
const transparencyTable = (colors: readonly number[]): Uint8Array | null => {
  const alphas = colors.map((color) => color & 0xff);
  const lastTransparent = alphas.reduce((last, alpha, index) => (alpha < 0xff ? index : last), -1);

  return lastTransparent < 0 ? null : Uint8Array.from(alphas.slice(0, lastTransparent + 1));
};

/** Each row is a filter byte followed by one index per pixel. Filtering indices gains nothing. */
const scanlines = (image: RgbaImage, indices: Uint8Array): Uint8Array => {
  const raw = new Uint8Array(image.height * (image.width + 1));

  for (let row = 0; row < image.height; row += 1) {
    const at = row * (image.width + 1);
    raw[at] = FILTER_NONE;
    raw.set(indices.subarray(row * image.width, (row + 1) * image.width), at + 1);
  }

  return raw;
};

export const encodeIndexedPng = (image: RgbaImage): Result<Uint8Array, IndexedPngError> => {
  if (image.width <= 0 || image.height <= 0) {
    return failure('empty-image');
  }

  const palette = paletteOf(image);
  if (!palette.ok) {
    return failure(palette.error);
  }

  const { colors, indices } = palette.value;
  const plte = new Uint8Array(colors.length * 3);
  colors.forEach((color, index) => {
    plte[index * 3] = (color >>> 24) & 0xff;
    plte[index * 3 + 1] = (color >>> 16) & 0xff;
    plte[index * 3 + 2] = (color >>> 8) & 0xff;
  });

  const alphas = transparencyTable(colors);
  const compressed = deflateSync(scanlines(image, indices), { level: 9 });

  const parts: Uint8Array[] = [
    SIGNATURE,
    chunk('IHDR', header(image.width, image.height)),
    chunk('PLTE', plte),
    ...(alphas === null ? [] : [chunk('tRNS', alphas)]),
    chunk('IDAT', new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)),
    chunk('IEND', new Uint8Array(0)),
  ];

  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }

  return success(png);
};
