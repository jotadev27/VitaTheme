/**
 * CRC-32 as ZIP requires it: the reflected IEEE 802.3 polynomial, which is the only
 * checksum the archive format accepts. Implemented here because the whole of the ZIP
 * writing this project needs is a few hundred lines, and an archive that other tools must
 * read is not a place to inherit surprises from a general-purpose library.
 */
const CRC32_POLYNOMIAL = 0xedb88320;
const TABLE_SIZE = 256;
const INITIAL_CRC = 0xffffffff;

const TABLE = ((): Uint32Array => {
  const table = new Uint32Array(TABLE_SIZE);

  for (let index = 0; index < TABLE_SIZE; index += 1) {
    let remainder = index;
    for (let bit = 0; bit < 8; bit += 1) {
      remainder = (remainder & 1) === 1 ? (remainder >>> 1) ^ CRC32_POLYNOMIAL : remainder >>> 1;
    }
    table[index] = remainder >>> 0;
  }

  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let crc = INITIAL_CRC;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (TABLE[(crc ^ byte) & 0xff] ?? 0);
  }

  return (crc ^ INITIAL_CRC) >>> 0;
};
