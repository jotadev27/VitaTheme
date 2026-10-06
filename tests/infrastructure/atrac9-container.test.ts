import { describe, expect, it } from 'vitest';
import { readAtrac9Container } from '@/infrastructure/media/audio-header-reader';
import { riffWaveBytes } from '../support/binary-fixtures';

const chunkOffset = (bytes: Uint8Array, id: string): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 12; at + 8 <= bytes.length;) {
    if (new TextDecoder().decode(bytes.subarray(at, at + 4)) === id) return at;
    const size = view.getUint32(at + 4, true);
    at += 8 + size + (size % 2);
  }
  throw new Error(`Missing ${id} fixture chunk`);
};

const appended = (bytes: Uint8Array, tail: Uint8Array): Uint8Array => {
  const result = new Uint8Array(bytes.length + tail.length);
  result.set(bytes);
  result.set(tail, bytes.length);
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  return result;
};

describe('complete ATRAC9 containers', () => {
  it('accepts a complete, aligned container, including optional RIFF padding', () => {
    for (const withOddSizedLeadingChunk of [false, true]) {
      expect(
        readAtrac9Container(riffWaveBytes({ atrac9: true, withOddSizedLeadingChunk })),
      ).toMatchObject({ format: 'at9', sampleRate: 48000, channelCount: 2 });
    }
  });

  it('rejects plain WAV, executable signatures and truncated audio', () => {
    expect(readAtrac9Container(riffWaveBytes({ atrac9: false }))).toBeNull();
    expect(readAtrac9Container(new TextEncoder().encode('MZ executable data'))).toBeNull();
    const bytes = riffWaveBytes({ atrac9: true });
    for (const size of [0, 12, 30, bytes.length - 1]) {
      expect(readAtrac9Container(bytes.subarray(0, size))).toBeNull();
    }
  });

  it('accepts loop metadata with either additional-data or inclusive-loop sizes', () => {
    for (const loopMetadata of ['standard', 'inclusive-size'] as const) {
      const bytes = riffWaveBytes({ atrac9: true, loopMetadata });
      expect(readAtrac9Container(bytes)).toMatchObject({ format: 'at9' });
    }
  });

  it('still rejects loop records and sampler data extending beyond the chunk', () => {
    for (const loopMetadata of ['standard', 'inclusive-size'] as const) {
      for (const [fieldOffset, value] of [
        [28, 2],
        [28, 0xffffffff],
        [32, 25],
        [32, 0xffffffff],
      ] as const) {
        const bytes = riffWaveBytes({ atrac9: true, loopMetadata });
        new DataView(bytes.buffer).setUint32(
          chunkOffset(bytes, 'smpl') + 8 + fieldOffset,
          value,
          true,
        );
        expect(readAtrac9Container(bytes)).toBeNull();
      }
      const bytes = riffWaveBytes({ atrac9: true, loopMetadata });
      new DataView(bytes.buffer).setUint32(chunkOffset(bytes, 'smpl') + 8 + 44, 256, true);
      expect(readAtrac9Container(bytes)).toBeNull();
    }
  });

  it('rejects undeclared bytes appended after the RIFF container', () => {
    const bytes = riffWaveBytes({ atrac9: true });
    const result = new Uint8Array(bytes.length + 2);
    result.set(bytes);
    result.set([0x4d, 0x5a], bytes.length);
    expect(readAtrac9Container(result)).toBeNull();
  });

  it('rejects duplicate format chunks and unknown embedded chunks', () => {
    const bytes = riffWaveBytes({ atrac9: true });
    const at = chunkOffset(bytes, 'fmt ');
    expect(readAtrac9Container(appended(bytes, bytes.subarray(at, at + 60)))).toBeNull();
    expect(
      readAtrac9Container(
        appended(bytes, new TextEncoder().encode('EXEC\u0000\u0000\u0000\u0000')),
      ),
    ).toBeNull();
  });

  it('rejects invalid stream configuration, chunk lengths and sample counts', () => {
    for (const mutate of [
      (bytes: Uint8Array) => {
        bytes[chunkOffset(bytes, 'fmt ') + 8 + 44] = 0;
      },
      (bytes: Uint8Array) => {
        new DataView(bytes.buffer).setUint32(chunkOffset(bytes, 'data') + 4, 0xffffffff, true);
      },
      (bytes: Uint8Array) => {
        new DataView(bytes.buffer).setUint32(chunkOffset(bytes, 'fact') + 8, 0xffffffff, true);
      },
      (bytes: Uint8Array) => {
        new DataView(bytes.buffer).setUint16(chunkOffset(bytes, 'fmt ') + 8 + 12, 0, true);
      },
    ]) {
      const bytes = riffWaveBytes({ atrac9: true });
      mutate(bytes);
      expect(readAtrac9Container(bytes)).toBeNull();
    }
  });
});
