import { randomBytes } from 'node:crypto';
import { lstat, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { failure, success, type Result } from '../../domain/shared/result';
import {
  themeExportFailure,
  type ThemeExportFailure,
} from '../../application/ports/theme-export-target';
import { describeFileSystemError } from '../filesystem/contained-path';

/**
 * Deciding where something may be written, and putting it there without a window in which
 * the destination holds half of it.
 *
 * An export is built beside its destination under a temporary name and moved into place in
 * one step at the end. A rename within a directory is atomic and cannot cross a filesystem
 * boundary, which is why the temporary name is a sibling of the destination rather than a
 * path in the system temporary folder.
 */

/** What the destination has to be: a folder holding the theme, or a single archive file. */
export type DestinationKind = 'folder' | 'file';

const KIND_LABELS: Readonly<Record<DestinationKind, string>> = {
  folder: 'folder',
  file: 'file',
};

const TEMPORARY_PREFIX = '.vitatheme-export-';
const REPLACED_PREFIX = '.vitatheme-replaced-';
const TEMPORARY_SUFFIX_BYTES = 8;

export interface PreparedDestination {
  /** Real path of the directory that will hold the export. */
  readonly parentRealPath: string;
  readonly path: string;
  readonly name: string;
  readonly kind: DestinationKind;
  readonly existed: boolean;
}

/** Unpredictable so that an export cannot be steered by a name guessed in advance. */
export const temporarySiblingPath = (parentRealPath: string, prefix = TEMPORARY_PREFIX): string =>
  join(parentRealPath, `${prefix}${randomBytes(TEMPORARY_SUFFIX_BYTES).toString('hex')}`);

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

const isMissing = (error: unknown): boolean => errorCode(error) === 'ENOENT';

/** A path that is already taken. Raised by the `wx` flag, which never follows or replaces. */
export const isAlreadyExists = (error: unknown): boolean => errorCode(error) === 'EEXIST';

/** A target may be committed or discarded once; anything after that is a mistake, not a state. */
export const alreadyFinished = (): ThemeExportFailure =>
  themeExportFailure('write-failed', 'The export has already finished.');

export const writeFailure = (
  error: unknown,
  message: string,
  code: ThemeExportFailure['code'] = 'write-failed',
): ThemeExportFailure =>
  themeExportFailure(
    errorCode(error) === 'EACCES' || errorCode(error) === 'EPERM' ? 'destination-unwritable' : code,
    `${message}: ${describeFileSystemError(error)}.`,
  );

/**
 * What is at a path, if anything.
 *
 * `lstat`, never `stat`: a symbolic link at the destination is a link, not what it points
 * at, and replacing it must not mean writing through it to somewhere else.
 */
type ExistingEntry =
  | { readonly present: false }
  | { readonly present: true; readonly kind: DestinationKind | 'other' };

const describeExisting = async (path: string): Promise<Result<ExistingEntry, unknown>> => {
  try {
    const stats = await lstat(path);
    if (stats.isDirectory()) {
      return success({ present: true, kind: 'folder' });
    }
    return success({ present: true, kind: stats.isFile() ? 'file' : 'other' });
  } catch (error) {
    return isMissing(error) ? success({ present: false }) : failure(error);
  }
};

/**
 * Checks that a destination can receive an export, before anything is written.
 *
 * The parent directory is resolved once here, and everything that follows is built inside
 * it, so an export cannot be redirected by a link somewhere along the path.
 */
export const prepareDestination = async (
  destinationPath: string,
  kind: DestinationKind,
  overwrite: boolean,
  /** What is being written, for the messages: an export, or a project being saved. */
  subject = 'export',
): Promise<Result<PreparedDestination, ThemeExportFailure>> => {
  const absolute = resolve(destinationPath);
  const name = basename(absolute);
  const label = KIND_LABELS[kind];

  if (name === '' || absolute === dirname(absolute)) {
    return failure(
      themeExportFailure(
        'destination-invalid',
        `The ${subject} needs a name of its own; a drive or filesystem root cannot hold one.`,
      ),
    );
  }

  let parentRealPath: string;
  try {
    parentRealPath = await realpath(dirname(absolute));
  } catch (error) {
    return failure(
      isMissing(error)
        ? themeExportFailure(
            'destination-invalid',
            `The folder that would hold the ${subject} does not exist.`,
          )
        : writeFailure(error, `The folder that would hold the ${subject} could not be opened`),
    );
  }

  const path = join(parentRealPath, name);
  const existing = await describeExisting(path);
  if (!existing.ok) {
    return failure(writeFailure(existing.error, `"${name}" could not be examined`));
  }

  if (existing.value.present) {
    if (!overwrite) {
      return failure(
        themeExportFailure(
          'destination-exists',
          `"${name}" already exists. Choose another name, or allow it to be replaced.`,
        ),
      );
    }

    if (existing.value.kind !== kind) {
      return failure(
        themeExportFailure(
          'destination-invalid',
          `"${name}" already exists and is not a ${label}, so it will not be replaced.`,
        ),
      );
    }
  }

  return success({ parentRealPath, path, name, kind, existed: existing.value.present });
};

const restore = async (asidePath: string, destinationPath: string): Promise<boolean> => {
  try {
    await rename(asidePath, destinationPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Moves a finished export into place.
 *
 * When something is already there it is moved aside first and removed only once the new
 * export has landed, so a failure at the last moment leaves the previous theme intact
 * rather than nothing at all.
 */
export const publishAtomically = async (
  temporaryPath: string,
  destination: PreparedDestination,
): Promise<Result<void, ThemeExportFailure>> => {
  const label = KIND_LABELS[destination.kind];

  if (!destination.existed) {
    // Re-checked here rather than trusted from earlier: something may have appeared at the
    // destination while the export was being written, and it is not ours to overwrite.
    const existing = await describeExisting(destination.path);
    if (existing.ok && existing.value.present) {
      return failure(
        themeExportFailure(
          'destination-exists',
          `"${destination.name}" appeared while the theme was being exported and was left alone.`,
        ),
      );
    }

    try {
      await rename(temporaryPath, destination.path);
      return success(undefined);
    } catch (error) {
      return failure(writeFailure(error, `"${destination.name}" could not be created`));
    }
  }

  const asidePath = temporarySiblingPath(destination.parentRealPath, REPLACED_PREFIX);
  try {
    await rename(destination.path, asidePath);
  } catch (error) {
    return failure(
      writeFailure(error, `The existing ${label} "${destination.name}" could not be replaced`),
    );
  }

  try {
    await rename(temporaryPath, destination.path);
  } catch (error) {
    const restored = await restore(asidePath, destination.path);
    return failure(
      themeExportFailure(
        'destination-unwritable',
        `"${destination.name}" could not be replaced: ${describeFileSystemError(error)}. ` +
          (restored
            ? 'The previous version is unchanged.'
            : `The previous version is beside it, named "${basename(asidePath)}".`),
      ),
    );
  }

  await rm(asidePath, { recursive: true, force: true });
  return success(undefined);
};

/** Removes a staged export. Never throws: it runs on the failure path. */
export const removeQuietly = async (path: string): Promise<void> => {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // An export that could not be cleaned up must not mask the failure that led here.
  }
};
