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

    if (
      asciiAt(bytes, offset, 4) === 'fmt ' &&
      offset + CHUNK_HEADER_BYTES + size <= bytes.length
    ) {
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
    formatChunk.size >= 52 &&
    equalsAt(bytes, formatChunk.offset + SUBFORMAT_GUID_OFFSET, ATRAC9_SUBFORMAT_GUID);

  return { kind: 'audio', format: isAtrac9 ? 'at9' : 'wav', sampleRate, channelCount };
};

/**
 * Checks the complete container without decoding audio or running code from it.
 * Format reference: https://github.com/Thealexbarney/VGAudio/blob/master/docs/audio-formats/atrac9/container.md
 * This is a structural check, not a malware scan or proof that every frame is playable.
 */
export const readAtrac9Container = (bytes: Uint8Array): AudioDescriptor | null => {
  const media = readAudioHeader(bytes);
  if (media?.format !== 'at9' || readUint32LE(bytes, 4) !== bytes.length - 8) return null;
  const format = findFormatChunk(bytes);
  if (format === null) return null;
  const at = format.offset;
  const extensionSize = readUint16LE(bytes, at + 16);
  const version = readUint32LE(bytes, at + 40);
  const blockAlign = readUint16LE(bytes, at + 12);
  if (
    extensionSize === null ||
    extensionSize < 34 ||
    extensionSize + 18 !== format.size ||
    (version !== 1 && version !== 2) ||
    readUint16LE(bytes, at + 14) !== 0 ||
    bytes[at + 44] !== 0xfe ||
    blockAlign === null ||
    blockAlign === 0
  )
    return null;

  const config = new DataView(bytes.buffer, bytes.byteOffset + at + 44, 4).getUint32(0, false);
  const rateIndex = (config >>> 20) & 15;
  const channelIndex = (config >>> 17) & 7;
  const superframeIndex = (config >>> 3) & 3;
  const frameBytes = ((config >>> 5) & 2047) + 1;
  const rates = [
    11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 44100, 48000, 64000, 88200, 96000,
    128000, 176400, 192000,
  ];
  const channels = [1, 2, 2, 6, 8, 4];
  if (
    (config & 0x10000) !== 0 ||
    (superframeIndex !== 0 && superframeIndex !== 2) ||
    rates[rateIndex] !== media.sampleRate ||
    channels[channelIndex] !== media.channelCount ||
    frameBytes * (1 << superframeIndex) !== blockAlign
  )
    return null;

  let offset = RIFF_HEADER_BYTES;
  let chunks = 0;
  const seen = new Set<string>();
  let dataBytes = 0;
  let sampleCount = 0;
  let encoderDelay = 0;
  while (offset < bytes.length) {
    if (++chunks > 256 || offset + CHUNK_HEADER_BYTES > bytes.length) return null;
    const id = asciiAt(bytes, offset, 4);
    const size = readUint32LE(bytes, offset + 4);
    if (size === null) return null;
    const start = offset + CHUNK_HEADER_BYTES;
    const end = start + size;
    const next = end + (size % 2);
    if (next > bytes.length) return null;
    if (
      id !== 'JUNK' &&
      id !== 'LIST' &&
      id !== 'fmt ' &&
      id !== 'fact' &&
      id !== 'data' &&
      id !== 'smpl'
    )
      return null;
    if (id !== 'JUNK' && id !== 'LIST') {
      if (seen.has(id)) return null;
      seen.add(id);
    }
    if (id !== 'data' && size > 64 * 1024) return null;
    if (id === 'data') dataBytes = size;
    if (id === 'fact') {
      if (size < 12) return null;
      sampleCount = readUint32LE(bytes, start) ?? 0;
      encoderDelay = readUint32LE(bytes, start + 4) ?? 0;
    }
    if (id === 'smpl') {
      if (size < 36) return null;
      const loops = readUint32LE(bytes, start + 28) ?? 0;
      const extra = readUint32LE(bytes, start + 32) ?? 0;
      const loopBytes = loops * 24;
      // Some AT9 files count the loop table itself in dwSamplerData rather than
      // declaring additional bytes after it. Accept that exact layout as well;
      // neither convention may claim loop records outside the chunk.
      const standardLayout = 36 + loopBytes + extra === size;
      const inclusiveLoopSize = extra === loopBytes && 36 + loopBytes === size;
      if (!standardLayout && !inclusiveLoopSize) return null;
      for (let loop = 0; loop < loops; loop += 1) {
        const loopStart = readUint32LE(bytes, start + 36 + loop * 24 + 8) ?? 0;
        const loopEnd = readUint32LE(bytes, start + 36 + loop * 24 + 12) ?? 0;
        if (loopStart > loopEnd) return null;
      }
    }
    offset = next;
  }
  const samplesPerFrame =
    [64, 64, 128, 128, 128, 256, 256, 256, 64, 64, 128, 128, 128, 256, 256, 256][rateIndex] ?? 0;
  const capacity = (dataBytes / blockAlign) * samplesPerFrame * (1 << superframeIndex);
  return seen.has('fmt ') &&
    seen.has('fact') &&
    dataBytes > 0 &&
    dataBytes % blockAlign === 0 &&
    sampleCount > 0 &&
    sampleCount + encoderDelay <= capacity
    ? media
    : null;
};
