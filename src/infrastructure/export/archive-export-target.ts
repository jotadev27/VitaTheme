import { open, type FileHandle } from 'node:fs/promises';
import {
  themeExportFailure,
  type ThemeExportFailure,
  type ThemeExportTarget,
} from '../../application/ports/theme-export-target';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { failure, success, type Result } from '../../domain/shared/result';
import { THEME_XML_FILE_NAME } from '../../domain/vita/theme-xml-schema';
import {
  createZipArchiveWriter,
  type ZipArchiveWriter,
  type ZipWriteError,
} from '../archive/zip-archive-writer';
import {
  alreadyFinished,
  prepareDestination,
  publishAtomically,
  removeQuietly,
  temporarySiblingPath,
  writeFailure,
} from './destination';

/**
 * Writes a theme as the ZIP archive the community repositories accept: the manifest and
 * every asset at the root of the archive, under the paths the manifest refers to them by.
 *
 * The archive is written to a temporary file beside the destination and moved into place
 * only once it is complete, so a failure never leaves a truncated archive that looks like a
 * finished theme.
 */

export interface ArchiveExportOptions {
  /** Replace an existing file at the destination. Off unless the caller asks for it. */
  readonly overwrite?: boolean;
}

type TargetState = 'open' | 'finished';

const ARCHIVE_FAILURE_CODES: Readonly<Record<ZipWriteError['code'], ThemeExportFailure['code']>> = {
  'unsafe-path': 'unsafe-asset-path',
  'duplicate-path': 'duplicate-file',
  'too-large': 'archive-too-large',
  'compression-failed': 'write-failed',
};

const asExportFailure = (error: ZipWriteError): ThemeExportFailure =>
  themeExportFailure(ARCHIVE_FAILURE_CODES[error.code], error.message);

export const openArchiveExportTarget = async (
  destinationPath: string,
  options: ArchiveExportOptions = {},
): Promise<Result<ThemeExportTarget, ThemeExportFailure>> => {
  const prepared = await prepareDestination(destinationPath, 'file', options.overwrite ?? false);
  if (!prepared.ok) {
    return prepared;
  }

  const temporaryPath = temporarySiblingPath(prepared.value.parentRealPath);
  let handle: FileHandle;
  try {
    // `wx` fails rather than following or replacing anything already at the path.
    handle = await open(temporaryPath, 'wx');
  } catch (error) {
    return failure(writeFailure(error, 'The archive could not be started'));
  }

  let state: TargetState = 'open';
  const archive: ZipArchiveWriter = createZipArchiveWriter(async (bytes) => {
    await handle.write(bytes);
  });

  const closeQuietly = async (): Promise<void> => {
    try {
      await handle.close();
    } catch {
      // The archive is about to be thrown away; a failure to close adds nothing.
    }
  };

  const abandon = async (
    failed: ThemeExportFailure,
  ): Promise<Result<never, ThemeExportFailure>> => {
    state = 'finished';
    await closeQuietly();
    await removeQuietly(temporaryPath);
    return failure(failed);
  };

  const add = async (
    name: string,
    contents: Uint8Array,
  ): Promise<Result<void, ThemeExportFailure>> => {
    if (state !== 'open') {
      return failure(alreadyFinished());
    }

    try {
      const added = await archive.addFile(name, contents);
      // A rejected entry leaves the archive without it, so nothing more may be written.
      return added.ok ? success(undefined) : await abandon(asExportFailure(added.error));
    } catch (error) {
      return abandon(writeFailure(error, `"${name}" could not be written to the archive`));
    }
  };

  return success({
    writeManifest: (contents) => add(THEME_XML_FILE_NAME, contents),
    writeAsset: (path: ThemeAssetPath, contents) => add(path, contents),

    commit: async () => {
      if (state !== 'open') {
        return failure(alreadyFinished());
      }

      try {
        const finished = await archive.finish();
        if (!finished.ok) {
          return await abandon(asExportFailure(finished.error));
        }

        // The archive is complete on disk before it is published, not merely written.
        await handle.sync();
        await handle.close();
      } catch (error) {
        return abandon(writeFailure(error, 'The archive could not be completed'));
      }

      state = 'finished';
      const published = await publishAtomically(temporaryPath, prepared.value);
      if (!published.ok) {
        await removeQuietly(temporaryPath);
      }
      return published;
    },

    discard: async () => {
      if (state !== 'open') {
        return;
      }
      state = 'finished';
      await closeQuietly();
      await removeQuietly(temporaryPath);
    },
  });
};
