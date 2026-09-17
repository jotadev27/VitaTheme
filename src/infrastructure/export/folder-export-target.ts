import { mkdir, realpath, writeFile } from 'node:fs/promises';
import {
  themeExportFailure,
  type ThemeExportFailure,
  type ThemeExportTarget,
} from '../../application/ports/theme-export-target';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { failure, success, type Result } from '../../domain/shared/result';
import { THEME_XML_FILE_NAME } from '../../domain/vita/theme-xml-schema';
import { resolveNewFileWithin } from '../filesystem/contained-path';
import {
  alreadyFinished,
  isAlreadyExists,
  prepareDestination,
  publishAtomically,
  removeQuietly,
  temporarySiblingPath,
  writeFailure,
} from './destination';

/**
 * Writes a theme as a folder: the manifest at the root, every asset at the path the
 * manifest refers to it by.
 *
 * The folder is built under a temporary name beside the destination and moved into place
 * only once every file has been written, so an export that fails part-way leaves nothing
 * behind and never replaces a theme that already worked.
 */

export interface FolderExportOptions {
  /** Replace an existing folder at the destination. Off unless the caller asks for it. */
  readonly overwrite?: boolean;
}

type TargetState = 'open' | 'finished';

/** Where a file belongs inside the staging folder, refused if it would not land inside it. */
const resolveNewFile = async (
  rootRealPath: string,
  relativePath: string,
): Promise<Result<string, ThemeExportFailure>> => {
  const resolved = await resolveNewFileWithin(rootRealPath, relativePath);

  switch (resolved.status) {
    case 'resolved':
      return success(resolved.absolutePath);
    case 'unreadable':
      return failure(
        themeExportFailure(
          'write-failed',
          `"${relativePath}" could not be prepared: ${resolved.reason}.`,
        ),
      );
    default:
      return failure(
        themeExportFailure(
          'unsafe-asset-path',
          `"${relativePath}" would be written outside the exported theme.`,
        ),
      );
  }
};

export const openFolderExportTarget = async (
  destinationPath: string,
  options: FolderExportOptions = {},
): Promise<Result<ThemeExportTarget, ThemeExportFailure>> => {
  const prepared = await prepareDestination(destinationPath, 'folder', options.overwrite ?? false);
  if (!prepared.ok) {
    return prepared;
  }

  const stagingPath = temporarySiblingPath(prepared.value.parentRealPath);
  let stagingRealPath: string;
  try {
    // Not `recursive`: creating the staging folder must fail if the name is already taken.
    await mkdir(stagingPath);
    stagingRealPath = await realpath(stagingPath);
  } catch (error) {
    return failure(writeFailure(error, 'The export could not be started'));
  }

  let state: TargetState = 'open';

  const write = async (
    relativePath: string,
    contents: Uint8Array,
  ): Promise<Result<void, ThemeExportFailure>> => {
    if (state !== 'open') {
      return failure(alreadyFinished());
    }

    const resolved = await resolveNewFile(stagingRealPath, relativePath);
    if (!resolved.ok) {
      return resolved;
    }

    try {
      // `wx` fails rather than following or replacing anything already at the path.
      await writeFile(resolved.value, contents, { flag: 'wx' });
      return success(undefined);
    } catch (error) {
      return failure(
        writeFailure(
          error,
          `"${relativePath}" could not be written`,
          isAlreadyExists(error) ? 'duplicate-file' : 'write-failed',
        ),
      );
    }
  };

  return success({
    writeManifest: (contents) => write(THEME_XML_FILE_NAME, contents),
    writeAsset: (path: ThemeAssetPath, contents) => write(path, contents),

    commit: async () => {
      if (state !== 'open') {
        return failure(alreadyFinished());
      }
      state = 'finished';

      const published = await publishAtomically(stagingRealPath, prepared.value);
      if (!published.ok) {
        await removeQuietly(stagingRealPath);
      }
      return published;
    },

    discard: async () => {
      if (state !== 'open') {
        return;
      }
      state = 'finished';
      await removeQuietly(stagingRealPath);
    },
  });
};
