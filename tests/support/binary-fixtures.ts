/**
 * Synthetic container headers for tests.
 *
 * The media readers only ever look at a file's header, so these fixtures reproduce exactly
 * that much. They are deliberately *not* complete, playable or viewable files: checksums and
 * payloads are left as zeros. Generating them keeps binaries out of the repository and keeps
 * every test case explicit about the bytes it is exercising.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const uint32BE = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const uint32LE = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];

const uint16LE = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff];

const uint16BE = (value: number): number[] => [(value >>> 8) & 0xff, value & 0xff];

const ascii = (text: string): number[] => [...new TextEncoder().encode(text)];

const PLACEHOLDER_CRC = [0, 0, 0, 0];

const pngChunk = (type: string, data: readonly number[]): number[] => [
  ...uint32BE(data.length),
  ...ascii(type),
  ...data,
  ...PLACEHOLDER_CRC,
];

export type PngColorType = 0 | 2 | 3 | 4 | 6;

export interface PngHeaderOptions {
  readonly width: number;
  readonly height: number;
  readonly bitDepth?: number;
  readonly colorType?: PngColorType;
  readonly withTransparencyChunk?: boolean;
}

export const pngHeaderBytes = ({
  width,
  height,
  bitDepth = 8,
  colorType = 3,
  withTransparencyChunk = false,
}: PngHeaderOptions): Uint8Array =>
  Uint8Array.from([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', [...uint32BE(width), ...uint32BE(height), bitDepth, colorType, 0, 0, 0]),
    ...(withTransparencyChunk ? pngChunk('tRNS', [0x00]) : []),
    ...pngChunk('IDAT', [0x00]),
  ]);

export const jpegHeaderBytes = (width: number, height: number): Uint8Array =>
  Uint8Array.from([
    0xff,
    0xd8,
    // APP0/JFIF segment, skipped by the reader on its way to the frame header.
    0xff,
    0xe0,
    ...uint16BE(16),
    ...ascii('JFIF\0'),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    // SOF0: precision, height, width, component count.
    0xff,
    0xc0,
    ...uint16BE(11),
    8,
    ...uint16BE(height),
    ...uint16BE(width),
    3,
  ]);

export const gifHeaderBytes = (width: number, height: number): Uint8Array =>
  Uint8Array.from([...ascii('GIF89a'), ...uint16LE(width), ...uint16LE(height), 0, 0, 0]);

export const bmpHeaderBytes = (width: number, height: number): Uint8Array =>
  Uint8Array.from([
    ...ascii('BM'),
    ...uint32LE(0),
    ...uint32LE(0),
    ...uint32LE(54),
    ...uint32LE(40),
    ...uint32LE(width),
    ...uint32LE(height),
    ...uint16LE(1),
    ...uint16LE(24),
  ]);

const ATRAC9_SUBFORMAT_GUID = [
  0xd2, 0x42, 0xe1, 0x47, 0xba, 0x36, 0x8d, 0x4d, 0x88, 0xfc, 0x61, 0x65, 0x4f, 0x8c, 0x83, 0x6c,
];

const WAVE_FORMAT_PCM = 0x0001;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

export interface RiffWaveOptions {
  readonly atrac9: boolean;
  readonly sampleRate?: number;
  readonly channelCount?: number;
  /** Emits an odd-sized chunk before `fmt ` to exercise RIFF word alignment. */
  readonly withOddSizedLeadingChunk?: boolean;
}

export const riffWaveBytes = ({
  atrac9,
  sampleRate = 48000,
  channelCount = 2,
  withOddSizedLeadingChunk = false,
}: RiffWaveOptions): Uint8Array => {
  const formatBody = atrac9
    ? [
        ...uint16LE(WAVE_FORMAT_EXTENSIBLE),
        ...uint16LE(channelCount),
        ...uint32LE(sampleRate),
        ...uint32LE(18000),
        ...uint16LE(384),
        ...uint16LE(0),
        ...uint16LE(34),
        ...uint16LE(1024),
        ...uint32LE(3),
        ...ATRAC9_SUBFORMAT_GUID,
      ]
    : [
        ...uint16LE(WAVE_FORMAT_PCM),
        ...uint16LE(channelCount),
        ...uint32LE(sampleRate),
        ...uint32LE(sampleRate * channelCount * 2),
        ...uint16LE(channelCount * 2),
        ...uint16LE(16),
      ];

  const leadingChunk = withOddSizedLeadingChunk
    ? [...ascii('JUNK'), ...uint32LE(3), 0, 0, 0, 0]
    : [];

  const body = [
    ...ascii('WAVE'),
    ...leadingChunk,
    ...ascii('fmt '),
    ...uint32LE(formatBody.length),
    ...formatBody,
    ...ascii('data'),
    ...uint32LE(0),
  ];

  return Uint8Array.from([...ascii('RIFF'), ...uint32LE(body.length), ...body]);
};

/**
 * A WebP header, which this application names but cannot read.
 *
 * `RIFF`, a size, `WEBP`, and the first chunk — enough for the container to be identified,
 * which is all anything here does with one.
 */
export const webpHeaderBytes = (): Uint8Array => {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  new DataView(bytes.buffer).setUint32(4, 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // VP8␣
  return bytes;
};

/** An ISO base media header, as AVIF and HEIC both use: a size, `ftyp`, and a brand. */
export const isoBaseMediaHeaderBytes = (brand: string): Uint8Array => {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(0, 16, false);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  for (let at = 0; at < 4; at += 1) {
    bytes[8 + at] = brand.charCodeAt(at);
  }
  return bytes;
};
