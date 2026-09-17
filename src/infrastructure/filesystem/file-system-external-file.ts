import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MAX_THEME_ASSET_BYTES } from '../../application/ports/theme-assets';
import {
  MAX_FOLDER_ENTRIES,
  type ExternalFile,
  type ExternalFileError,
  type ExternalFileStore,
  type ExternalFolderEntry,
} from '../../application/ports/external-file';
import { failure, success } from '../../domain/shared/result';
import { identifyMedia, MEDIA_HEADER_BYTES } from '../media/media-probe';
import { describeFileSystemError, readFileWithin } from './contained-path';

/**
 * Files brought into a theme from elsewhere on the machine.
 *
 * There is no root to confine these to — the whole point is that they come from outside the
 * theme — so the protection is of a different kind: the path is resolved before it is used,
 * so a link cannot make it mean something else afterwards; only a regular file is accepted,
 * so a device or a pipe cannot be read; a size ceiling applies, so nothing can be made to
 * exhaust memory; and the file is identified from its header rather than from its name.
 *
 * Nothing is ever run, parsed as markup, or handed to a decoder here.
 */

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

const missing = (): ExternalFileError => ({
  code: 'missing',
  message: 'That file is no longer there.',
});

const readFailure = (error: unknown): ExternalFileError =>
  errorCode(error) === 'ENOENT'
    ? missing()
    : {
        code: 'unreadable',
        message: `The file could not be read: ${describeFileSystemError(error)}.`,
      };

const tooLarge = (): ExternalFileError => ({
  code: 'too-large',
  message:
    `That file is larger than ${String(MAX_THEME_ASSET_BYTES / (1024 * 1024))} MB, which is far ` +
    'beyond anything a theme uses. Check that it is the file you meant to choose.',
});

export const fileSystemExternalFiles = (): ExternalFileStore => ({
  inspect: async (location) => {
    let resolved: string;
    try {
      // Resolved once, here: from this point the application holds a path that no longer
      // passes through a symbolic link.
      resolved = await realpath(location);
    } catch (error) {
      return failure(readFailure(error));
    }

    try {
      const stats = await stat(resolved);
      if (!stats.isFile()) {
        return failure({
          code: 'not-a-file',
          message: 'That is not a file, so it cannot be part of a theme.',
        });
      }
      if (stats.size > MAX_THEME_ASSET_BYTES) {
        return failure(tooLarge());
      }

      const header = await readFileWithin(resolved, MEDIA_HEADER_BYTES);
      const file: ExternalFile = {
        reference: resolved,
        displayName: basename(resolved),
        inspected: { byteSize: stats.size, media: identifyMedia(header) },
      };

      return success(file);
    } catch (error) {
      return failure(readFailure(error));
    }
  },

  listFolder: async (path) => {
    let resolved: string;
    try {
      resolved = await realpath(path);
    } catch (error) {
      return failure(readFailure(error));
    }

    try {
      const stats = await stat(resolved);
      if (!stats.isDirectory()) {
        return failure({
          code: 'not-a-folder',
          message: 'That is not a folder.',
        });
      }

      const found = await readdir(resolved, { withFileTypes: true });
      if (found.length > MAX_FOLDER_ENTRIES) {
        return failure({
          code: 'too-many-entries',
          message:
            `That folder holds more than ${String(MAX_FOLDER_ENTRIES)} items. A folder of ` +
            'system icons holds seventeen, so this is unlikely to be the one you meant.',
        });
      }

      // Only ordinary files, only this level. A directory is not descended into and a link
      // is not followed: either could lead anywhere, and neither is part of an icon set.
      // The order is the platform's, so it is sorted here to keep the result predictable.
      const entries: ExternalFolderEntry[] = found
        .filter((entry) => entry.isFile())
        .map((entry) => ({ name: entry.name, location: join(resolved, entry.name) }))
        .sort((left, right) => left.name.localeCompare(right.name, 'en'));

      return success(entries);
    } catch (error) {
      return failure(readFailure(error));
    }
  },

  read: async (reference) => {
    try {
      const stats = await stat(reference);
      if (!stats.isFile()) {
        return failure({
          code: 'not-a-file',
          message: 'That is not a file, so it cannot be part of a theme.',
        });
      }
      // Checked again rather than trusted: the file may have grown since it was chosen.
      if (stats.size > MAX_THEME_ASSET_BYTES) {
        return failure(tooLarge());
      }

      return success(await readFileWithin(reference, stats.size));
    } catch (error) {
      return failure(readFailure(error));
    }
  },
});
