import { describe, expect, it } from 'vitest';
import { crc32 } from '@/infrastructure/archive/crc32';

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Checked against the published values for CRC-32/ISO-HDLC rather than against another
 * implementation in this repository: a checksum that only agrees with itself would let an
 * archive be written that no other tool accepts.
 */
describe('crc32', () => {
  it('matches the standard check value for "123456789"', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for no bytes at all', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it.each([
    ['a', 0xe8b7be43],
    ['abc', 0x352441c2],
    ['The quick brown fox jumps over the lazy dog', 0x414fa339],
  ])('matches the published checksum of %j', (text, expected) => {
    expect(crc32(ascii(text))).toBe(expected);
  });

  it('is unsigned: the high bit does not turn it negative', () => {
    // 0xFF repeated is one of the inputs whose checksum sets the top bit.
    expect(crc32(new Uint8Array(4).fill(0xff))).toBeGreaterThan(0);
    expect(crc32(new Uint8Array(4).fill(0xff))).toBeLessThanOrEqual(0xffffffff);
  });
});
