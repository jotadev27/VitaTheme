import type {
  ImageColorModel,
  ImageDescriptor,
  ImageEncoding,
  UnsupportedImageContainer,
} from '../../domain/model/media';

/**
 * Identifies an image from its container header.
 *
 * Theme assets are user-supplied files. Reading a fixed-size header keeps an oversized or
 * deliberately malformed image from being decoded, so validating an untrusted theme costs a
 * few bytes per file and cannot be turned into a decompression attack.
 *
 * PNG is parsed in full because it is the only format a theme may use. Other formats are
 * identified far enough to tell the author what they actually supplied.
 */

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PNG_COLOR_MODELS: Readonly<Record<number, ImageColorModel>> = {
  0: 'grayscale',
  2: 'truecolor',
  3: 'indexed',
  4: 'grayscale-alpha',
  6: 'truecolor-alpha',
};

const startsWith = (bytes: Uint8Array, prefix: Uint8Array): boolean =>
  bytes.length >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);

const asciiAt = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const readUint32BE = (bytes: Uint8Array, offset: number): number | null =>
  offset + 4 <= bytes.length
    ? (((bytes[offset] ?? 0) << 24) >>> 0) +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)
    : null;

const readUint16BE = (bytes: Uint8Array, offset: number): number | null =>
  offset + 2 <= bytes.length ? ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0) : null;

const readUint16LE = (bytes: Uint8Array, offset: number): number | null =>
  offset + 2 <= bytes.length ? ((bytes[offset + 1] ?? 0) << 8) + (bytes[offset] ?? 0) : null;

const readInt32LE = (bytes: Uint8Array, offset: number): number | null =>
  offset + 4 <= bytes.length
    ? new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true)
    : null;

const PNG_CHUNK_HEADER_BYTES = 8;
const PNG_CHUNK_CRC_BYTES = 4;
const PNG_IHDR_OFFSET = 8;
const PNG_IHDR_DATA_OFFSET = PNG_IHDR_OFFSET + PNG_CHUNK_HEADER_BYTES;

/**
 * Looks for a transparency chunk, which the specification places before the first image
 * data chunk. Stopping at `IDAT` bounds the walk to the header region of the file.
 */
const pngHasTransparencyChunk = (bytes: Uint8Array): boolean => {
  let offset = PNG_IHDR_OFFSET;

  while (offset + PNG_CHUNK_HEADER_BYTES <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    if (length === null) {
      return false;
    }

    const type = asciiAt(bytes, offset + 4, 4);
    if (type === 'tRNS') {
      return true;
    }
    if (type === 'IDAT' || type === 'IEND') {
      return false;
    }

    offset += PNG_CHUNK_HEADER_BYTES + length + PNG_CHUNK_CRC_BYTES;
  }

  return false;
};

const readPngEncoding = (bytes: Uint8Array): ImageEncoding | null => {
  const bitDepth = bytes[PNG_IHDR_DATA_OFFSET + 8];
  const colorType = bytes[PNG_IHDR_DATA_OFFSET + 9];
  if (bitDepth === undefined || colorType === undefined) {
    return null;
  }

  const colorModel = PNG_COLOR_MODELS[colorType];
  if (colorModel === undefined) {
    return null;
  }

  const hasAlphaChannel = colorModel === 'grayscale-alpha' || colorModel === 'truecolor-alpha';

  return {
    bitDepth,
    colorModel,
    hasTransparency: hasAlphaChannel || pngHasTransparencyChunk(bytes),
  };
};

const readPng = (bytes: Uint8Array): ImageDescriptor | null => {
  if (!startsWith(bytes, PNG_SIGNATURE)) {
    return null;
  }
  if (asciiAt(bytes, PNG_IHDR_OFFSET + 4, 4) !== 'IHDR') {
    return null;
  }

  const width = readUint32BE(bytes, PNG_IHDR_DATA_OFFSET);
  const height = readUint32BE(bytes, PNG_IHDR_DATA_OFFSET + 4);
  if (width === null || height === null) {
    return null;
  }

  return { kind: 'image', format: 'png', width, height, encoding: readPngEncoding(bytes) };
};

/** Frame markers that carry the image dimensions. Excludes DHT (C4), JPG (C8) and DAC (CC). */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Markers that stand alone: they are not followed by a length field. */
const JPEG_STANDALONE_MARKERS = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

const readJpeg = (bytes: Uint8Array): ImageDescriptor | null => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }

    const marker = bytes[offset + 1] ?? 0;
    // Runs of 0xFF are legal padding between markers.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (JPEG_STANDALONE_MARKERS.has(marker)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    const segmentLength = readUint16BE(bytes, offset + 2);
    if (segmentLength === null || segmentLength < 2) {
      return null;
    }

    if (JPEG_FRAME_MARKERS.has(marker)) {
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      return height === null || width === null
        ? null
        : { kind: 'image', format: 'jpeg', width, height, encoding: null };
    }

    offset += 2 + segmentLength;
  }

  return null;
};

const GIF_HEADER_LENGTH = 6;

const readGif = (bytes: Uint8Array): ImageDescriptor | null => {
  const header = asciiAt(bytes, 0, GIF_HEADER_LENGTH);
  if (header !== 'GIF87a' && header !== 'GIF89a') {
    return null;
  }

  const width = readUint16LE(bytes, 6);
  const height = readUint16LE(bytes, 8);
  return width === null || height === null
    ? null
    : { kind: 'image', format: 'gif', width, height, encoding: null };
};

const BITMAP_CORE_HEADER_SIZE = 12;

const readBmp = (bytes: Uint8Array): ImageDescriptor | null => {
  if (asciiAt(bytes, 0, 2) !== 'BM') {
    return null;
  }

  const headerSize = readInt32LE(bytes, 14);
  if (headerSize === null) {
    return null;
  }

  if (headerSize === BITMAP_CORE_HEADER_SIZE) {
    const width = readUint16LE(bytes, 18);
    const height = readUint16LE(bytes, 20);
    return width === null || height === null
      ? null
      : { kind: 'image', format: 'bmp', width, height, encoding: null };
  }

  const width = readInt32LE(bytes, 18);
  const height = readInt32LE(bytes, 22);
  return width === null || height === null
    ? null
    : // A negative height marks a top-down bitmap; the magnitude is the pixel height.
      { kind: 'image', format: 'bmp', width, height: Math.abs(height), encoding: null };
};

const READERS = [readPng, readJpeg, readGif, readBmp] as const;

/** Four bytes as ASCII, for the handful of formats identified by a tag rather than a number. */
const tagAt = (bytes: Uint8Array, at: number): string =>
  bytes.length < at + 4
    ? ''
    : String.fromCharCode(
        bytes[at] ?? 0,
        bytes[at + 1] ?? 0,
        bytes[at + 2] ?? 0,
        bytes[at + 3] ?? 0,
      );

/**
 * Picture formats worth naming even though nothing here can read them.
 *
 * Both turn up constantly in pictures saved from a browser, so somebody bringing artwork in
 * will meet them. Only the container is identified — no dimensions, no encoding — because
 * the answer is the same whatever is inside: the console cannot read it and this application
 * cannot convert it.
 */
const ISO_BASE_MEDIA_BRANDS: Readonly<Record<string, UnsupportedImageContainer>> = {
  avif: 'avif',
  avis: 'avif',
  heic: 'heic',
  heix: 'heic',
  hevc: 'heic',
  mif1: 'heic',
};

export const readUnsupportedImageContainer = (
  bytes: Uint8Array,
): UnsupportedImageContainer | null => {
  if (tagAt(bytes, 0) === 'RIFF' && tagAt(bytes, 8) === 'WEBP') {
    return 'webp';
  }

  return tagAt(bytes, 4) === 'ftyp' ? (ISO_BASE_MEDIA_BRANDS[tagAt(bytes, 8)] ?? null) : null;
};

export const readImageHeader = (bytes: Uint8Array): ImageDescriptor | null => {
  for (const read of READERS) {
    const descriptor = read(bytes);
    if (descriptor !== null) {
      return descriptor;
    }
  }
  return null;
};
