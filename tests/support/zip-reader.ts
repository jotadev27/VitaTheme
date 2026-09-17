import { inflateRawSync } from 'node:zlib';

/**
 * Reads a ZIP archive, for checking what the exporter produced.
 *
 * Written the way another tool would read the archive — find the end-of-central-directory
 * record, walk the central directory, then follow each entry's offset to its local header —
 * so a mistake in the writer shows up here rather than only on somebody else's machine. It
 * is deliberately unforgiving: anything inconsistent throws instead of being tolerated.
 */

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const CENTRAL_FILE_HEADER_BYTES = 46;
const LOCAL_FILE_HEADER_BYTES = 30;

export const ZIP_METHOD_STORED = 0;
export const ZIP_METHOD_DEFLATED = 8;

export interface ZipArchiveEntry {
  readonly name: string;
  readonly contents: Uint8Array;
  readonly compressionMethod: number;
  readonly flags: number;
  readonly versionMadeBy: number;
  readonly versionNeeded: number;
  readonly dosTime: number;
  readonly dosDate: number;
  readonly externalAttributes: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}

export interface ZipArchive {
  readonly entries: readonly ZipArchiveEntry[];
}

const viewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const findEndOfCentralDirectory = (bytes: Uint8Array): number => {
  const view = viewOf(bytes);

  for (let offset = bytes.length - END_OF_CENTRAL_DIRECTORY_BYTES; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new Error('The archive has no end-of-central-directory record.');
};

const decodeName = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes);

export const readZipArchive = (bytes: Uint8Array): ZipArchive => {
  const view = viewOf(bytes);
  const endOffset = findEndOfCentralDirectory(bytes);

  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryBytes = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);

  if (directoryOffset + directoryBytes !== endOffset) {
    throw new Error('The central directory does not end where the archive says it does.');
  }

  const entries: ZipArchiveEntry[] = [];
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Central directory entry ${String(index)} has the wrong signature.`);
    }

    const versionMadeBy = view.getUint16(offset + 4, true);
    const versionNeeded = view.getUint16(offset + 6, true);
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const dosTime = view.getUint16(offset + 12, true);
    const dosDate = view.getUint16(offset + 14, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const name = decodeName(
      bytes.subarray(
        offset + CENTRAL_FILE_HEADER_BYTES,
        offset + CENTRAL_FILE_HEADER_BYTES + nameLength,
      ),
    );

    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`"${name}" does not point at a local file header.`);
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localName = decodeName(
      bytes.subarray(
        localHeaderOffset + LOCAL_FILE_HEADER_BYTES,
        localHeaderOffset + LOCAL_FILE_HEADER_BYTES + localNameLength,
      ),
    );

    if (localName !== name) {
      throw new Error(`"${name}" is named "${localName}" in its local header.`);
    }
    if (view.getUint32(localHeaderOffset + 14, true) !== crc) {
      throw new Error(`"${name}" has a different checksum in its local header.`);
    }

    const dataOffset =
      localHeaderOffset + LOCAL_FILE_HEADER_BYTES + localNameLength + localExtraLength;
    const stored = bytes.subarray(dataOffset, dataOffset + compressedSize);

    const contents =
      compressionMethod === ZIP_METHOD_STORED ? stored : new Uint8Array(inflateRawSync(stored));

    if (contents.byteLength !== uncompressedSize) {
      throw new Error(`"${name}" does not hold the number of bytes the archive claims.`);
    }

    entries.push({
      name,
      contents,
      compressionMethod,
      flags,
      versionMadeBy,
      versionNeeded,
      dosTime,
      dosDate,
      externalAttributes,
      crc32: crc,
      compressedSize,
      uncompressedSize,
    });

    offset += CENTRAL_FILE_HEADER_BYTES + nameLength + extraLength + commentLength;
  }

  return { entries };
};

export const zipEntryNames = (archive: ZipArchive): readonly string[] =>
  archive.entries.map((entry) => entry.name);

export const zipEntry = (archive: ZipArchive, name: string): ZipArchiveEntry => {
  const found = archive.entries.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`The archive has no entry named "${name}".`);
  }
  return found;
};

export const zipEntryText = (archive: ZipArchive, name: string): string =>
  new TextDecoder('utf-8').decode(zipEntry(archive, name).contents);
