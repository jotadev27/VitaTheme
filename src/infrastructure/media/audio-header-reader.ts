import type { AudioDescriptor } from '../../domain/model/media';

/**
 * Identifies theme background music from its RIFF/WAVE header.
 *
 * ATRAC9 is carried inside an ordinary WAVE container, distinguished from uncompressed
 * audio only by the extensible-format sub-format GUID. Telling the two apart matters: a
 * plain `.wav` renamed to `.at9` is a common mistake, and the console simply plays nothing.
 */

/** `WAVE_FORMAT_EXTENSIBLE`; the real codec is then named by the sub-format GUID. */
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

/** {47E142D2-36BA-4D8D-88FC-61654F8C836C}, in the mixed-endian byte order RIFF stores. */
const ATRAC9_SUBFORMAT_GUID = Uint8Array.from([
  0xd2, 0x42, 0xe1, 0x47, 0xba, 0x36, 0x8d, 0x4d, 0x88, 0xfc, 0x61, 0x65, 0x4f, 0x8c, 0x83, 0x6c,
]);

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const FORMAT_CHUNK_MIN_BYTES = 16;
const SUBFORMAT_GUID_OFFSET = 24;

const asciiAt = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const readUint16LE = (bytes: Uint8Array, offset: number): number | null =>
  offset + 2 <= bytes.length ? ((bytes[offset + 1] ?? 0) << 8) + (bytes[offset] ?? 0) : null;

const readUint32LE = (bytes: Uint8Array, offset: number): number | null =>
  offset + 4 <= bytes.length
    ? new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true)
    : null;

const equalsAt = (bytes: Uint8Array, offset: number, expected: Uint8Array): boolean =>
  offset + expected.length <= bytes.length &&
  expected.every((byte, index) => bytes[offset + index] === byte);

const findFormatChunk = (bytes: Uint8Array): { offset: number; size: number } | null => {
  let offset = RIFF_HEADER_BYTES;

  while (offset + CHUNK_HEADER_BYTES <= bytes.length) {
    const size = readUint32LE(bytes, offset + 4);
    if (size === null) {
      return null;
    }

    if (asciiAt(bytes, offset, 4) === 'fmt ') {
      return { offset: offset + CHUNK_HEADER_BYTES, size };
    }

    // RIFF chunks are word-aligned: an odd-sized chunk is followed by a pad byte.
    offset += CHUNK_HEADER_BYTES + size + (size % 2);
  }

  return null;
};

export const readAudioHeader = (bytes: Uint8Array): AudioDescriptor | null => {
  if (asciiAt(bytes, 0, 4) !== 'RIFF' || asciiAt(bytes, 8, 4) !== 'WAVE') {
    return null;
  }

  const formatChunk = findFormatChunk(bytes);
  if (formatChunk === null || formatChunk.size < FORMAT_CHUNK_MIN_BYTES) {
    return null;
  }

  const formatTag = readUint16LE(bytes, formatChunk.offset);
  const channelCount = readUint16LE(bytes, formatChunk.offset + 2);
  const sampleRate = readUint32LE(bytes, formatChunk.offset + 4);
  if (formatTag === null || channelCount === null || sampleRate === null) {
    return null;
  }

  const isAtrac9 =
    formatTag === WAVE_FORMAT_EXTENSIBLE &&
    formatChunk.size >= SUBFORMAT_GUID_OFFSET + ATRAC9_SUBFORMAT_GUID.length &&
    equalsAt(bytes, formatChunk.offset + SUBFORMAT_GUID_OFFSET, ATRAC9_SUBFORMAT_GUID);

  return { kind: 'audio', format: isAtrac9 ? 'at9' : 'wav', sampleRate, channelCount };
};
