/**
 * Byte layout of the ZIP structures this project writes.
 *
 * Pure: every function here turns values into bytes and touches nothing else, so the
 * archive format can be verified field by field in a test. Only the parts a theme archive
 * needs are implemented — stored and deflated entries, no encryption, no ZIP64, no split
 * archives — and anything that does not fit is refused by the writer rather than emitted
 * as an archive other tools would read incorrectly.
 */

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const LOCAL_FILE_HEADER_BYTES = 30;
const CENTRAL_FILE_HEADER_BYTES = 46;
const END_OF_CENTRAL_DIRECTORY_BYTES = 22;

export const ZIP_METHOD_STORED = 0;
export const ZIP_METHOD_DEFLATED = 8;

/** 2.0: the version that introduced deflate, which is all these archives use. */
const VERSION_NEEDED = 20;

/**
 * Upper byte 0 marks the archive as made on MS-DOS, whose external attributes carry no
 * permission or file-type bits. A Unix-made archive can describe a symbolic link or an
 * executable; this one cannot, which is the safer thing for an archive holding files that
 * came from somewhere else.
 */
const VERSION_MADE_BY = VERSION_NEEDED;
const EXTERNAL_ATTRIBUTES = 0;
const INTERNAL_ATTRIBUTES = 0;

/** Marks the entry name as UTF-8 rather than the format's legacy code page. */
const FLAG_UTF8_NAMES = 0x0800;

/**
 * MS-DOS timestamps are written as a fixed value — 1 January 1980, the earliest the format
 * can express — so that exporting the same theme twice produces the same archive byte for
 * byte, and so that an archive carries nothing about when or where it was built.
 */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

export const ZIP_MAX_UINT16 = 0xffff;
export const ZIP_MAX_UINT32 = 0xffffffff;

/** Everything the central directory has to repeat about an entry once it is written. */
export interface ZipEntryRecord {
  /** The entry name, already UTF-8 encoded: the archive stores bytes, not characters. */
  readonly name: Uint8Array;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

const blockOf = (byteLength: number): { bytes: Uint8Array; view: DataView } => {
  const bytes = new Uint8Array(byteLength);
  return { bytes, view: new DataView(bytes.buffer) };
};

export const localFileHeader = (record: ZipEntryRecord): Uint8Array => {
  const { bytes, view } = blockOf(LOCAL_FILE_HEADER_BYTES + record.name.length);

  view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION_NEEDED, true);
  view.setUint16(6, FLAG_UTF8_NAMES, true);
  view.setUint16(8, record.compressionMethod, true);
  view.setUint16(10, DOS_TIME, true);
  view.setUint16(12, DOS_DATE, true);
  view.setUint32(14, record.crc32, true);
  view.setUint32(18, record.compressedSize, true);
  view.setUint32(22, record.uncompressedSize, true);
  view.setUint16(26, record.name.length, true);
  view.setUint16(28, 0, true);
  bytes.set(record.name, LOCAL_FILE_HEADER_BYTES);

  return bytes;
};

export const centralFileHeader = (record: ZipEntryRecord): Uint8Array => {
  const { bytes, view } = blockOf(CENTRAL_FILE_HEADER_BYTES + record.name.length);

  view.setUint32(0, CENTRAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION_MADE_BY, true);
  view.setUint16(6, VERSION_NEEDED, true);
  view.setUint16(8, FLAG_UTF8_NAMES, true);
  view.setUint16(10, record.compressionMethod, true);
  view.setUint16(12, DOS_TIME, true);
  view.setUint16(14, DOS_DATE, true);
  view.setUint32(16, record.crc32, true);
  view.setUint32(20, record.compressedSize, true);
  view.setUint32(24, record.uncompressedSize, true);
  view.setUint16(28, record.name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, INTERNAL_ATTRIBUTES, true);
  view.setUint32(38, EXTERNAL_ATTRIBUTES, true);
  view.setUint32(42, record.localHeaderOffset, true);
  bytes.set(record.name, CENTRAL_FILE_HEADER_BYTES);

  return bytes;
};

export interface EndOfCentralDirectory {
  readonly entryCount: number;
  readonly directoryBytes: number;
  readonly directoryOffset: number;
}

export const endOfCentralDirectory = ({
  entryCount,
  directoryBytes,
  directoryOffset,
}: EndOfCentralDirectory): Uint8Array => {
  const { bytes, view } = blockOf(END_OF_CENTRAL_DIRECTORY_BYTES);

  view.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, directoryBytes, true);
  view.setUint32(16, directoryOffset, true);
  view.setUint16(20, 0, true);

  return bytes;
};
