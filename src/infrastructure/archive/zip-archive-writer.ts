import { deflateRaw } from 'node:zlib';
import { parseThemeAssetPath } from '../../domain/model/theme-asset-path';
import { failure, success, type Result } from '../../domain/shared/result';
import { crc32 } from './crc32';
import {
  centralFileHeader,
  endOfCentralDirectory,
  localFileHeader,
  ZIP_MAX_UINT16,
  ZIP_MAX_UINT32,
  ZIP_METHOD_DEFLATED,
  ZIP_METHOD_STORED,
  type ZipEntryRecord,
} from './zip-format';

/**
 * Writes a ZIP archive one entry at a time.
 *
 * Bytes are handed to a sink as they are produced rather than accumulated, so the archive
 * itself is never held in memory; only the entry being compressed is. Entry names are
 * validated here as well as by the type system, because a name is the one part of an
 * archive that decides where a file lands when somebody else extracts it.
 */

/** Consumes the archive as it is produced. Free to throw: the caller owns the destination. */
export type ZipSink = (bytes: Uint8Array) => Promise<void>;

export type ZipWriteErrorCode =
  /** The entry name could escape the extraction folder, or cannot exist on some system. */
  | 'unsafe-path'
  | 'duplicate-path'
  /** Beyond what ZIP can describe without ZIP64, which this writer does not emit. */
  | 'too-large'
  | 'compression-failed';

export interface ZipWriteError {
  readonly code: ZipWriteErrorCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

export interface ZipArchiveWriter {
  addFile(name: string, contents: Uint8Array): Promise<Result<void, ZipWriteError>>;
  /** Writes the central directory. Call once, after the last entry. */
  finish(): Promise<Result<void, ZipWriteError>>;
}

const BEST_COMPRESSION = 9;

const compress = (contents: Uint8Array): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    deflateRaw(contents, { level: BEST_COMPRESSION }, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(new Uint8Array(result.buffer, result.byteOffset, result.byteLength));
    });
  });

interface CompressedEntry {
  readonly compressionMethod: number;
  readonly data: Uint8Array;
}

/**
 * PNG and ATRAC9 are already compressed, so deflating them can cost more bytes than it
 * saves. Storing whichever is smaller keeps a theme as close as possible to the sharing
 * size limit it has to fit under.
 */
const packEntry = async (contents: Uint8Array): Promise<CompressedEntry> => {
  const deflated = await compress(contents);

  return deflated.byteLength < contents.byteLength
    ? { compressionMethod: ZIP_METHOD_DEFLATED, data: deflated }
    : { compressionMethod: ZIP_METHOD_STORED, data: contents };
};

export const createZipArchiveWriter = (sink: ZipSink): ZipArchiveWriter => {
  const records: ZipEntryRecord[] = [];
  const names = new Set<string>();
  let offset = 0;

  const write = async (bytes: Uint8Array): Promise<void> => {
    await sink(bytes);
    offset += bytes.byteLength;
  };

  const addFile = async (
    name: string,
    contents: Uint8Array,
  ): Promise<Result<void, ZipWriteError>> => {
    const parsed = parseThemeAssetPath(name);
    if (!parsed.ok) {
      return failure({
        code: 'unsafe-path',
        message: `"${name}" cannot be used as a name inside an archive.`,
      });
    }

    const entryName = parsed.value;
    if (names.has(entryName)) {
      return failure({
        code: 'duplicate-path',
        message: `The archive would hold "${entryName}" twice.`,
      });
    }

    if (contents.byteLength > ZIP_MAX_UINT32 || records.length >= ZIP_MAX_UINT16) {
      return failure({
        code: 'too-large',
        message: 'The theme is too large to be stored in a ZIP archive.',
      });
    }

    let packed: CompressedEntry;
    try {
      packed = await packEntry(contents);
    } catch {
      return failure({
        code: 'compression-failed',
        message: `"${entryName}" could not be compressed.`,
      });
    }

    const encodedName = new TextEncoder().encode(entryName);
    const record: ZipEntryRecord = {
      name: encodedName,
      compressionMethod: packed.compressionMethod,
      crc32: crc32(contents),
      compressedSize: packed.data.byteLength,
      uncompressedSize: contents.byteLength,
      localHeaderOffset: offset,
    };

    const header = localFileHeader(record);
    if (offset + header.byteLength + packed.data.byteLength > ZIP_MAX_UINT32) {
      return failure({
        code: 'too-large',
        message: 'The theme is too large to be stored in a ZIP archive.',
      });
    }

    await write(header);
    await write(packed.data);

    records.push(record);
    names.add(entryName);
    return success(undefined);
  };

  const finish = async (): Promise<Result<void, ZipWriteError>> => {
    const directoryOffset = offset;

    for (const record of records) {
      await write(centralFileHeader(record));
    }

    await write(
      endOfCentralDirectory({
        entryCount: records.length,
        directoryBytes: offset - directoryOffset,
        directoryOffset,
      }),
    );

    return success(undefined);
  };

  return { addFile, finish };
};
