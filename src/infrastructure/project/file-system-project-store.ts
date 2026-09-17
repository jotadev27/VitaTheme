import { lstat, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  ProjectAssets,
  ProjectStore,
  ProjectStoreError,
  ProjectStoreErrorCode,
  RecoveryLocation,
  StoredProject,
} from '../../application/ports/project-store';
import { emptyThemeAssetSource, type ThemeAssetSource } from '../../application/ports/theme-assets';
import type { ThemeExportFailure } from '../../application/ports/theme-export-target';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { failure, success, type Result } from '../../domain/shared/result';
import {
  describeFileSystemError,
  readFileWithin,
  resolveNewFileWithin,
} from '../filesystem/contained-path';
import { folderAssetSource } from '../filesystem/folder-asset-source';
import {
  prepareDestination,
  publishAtomically,
  removeQuietly,
  temporarySiblingPath,
  type PreparedDestination,
} from '../export/destination';
import { projectAssetsPath, projectRecoveryPath } from './project-paths';

/**
 * Projects on the filesystem.
 *
 * Saving is the operation this file exists for, and the rule it keeps is that a project
 * document never refers to files that are not there: the assets folder is published first
 * and the document last, each by the same move-into-place used for exports. A save that
 * fails part-way leaves the project that was already there exactly as it was.
 *
 * Reading is treated as reading somebody else's file, because it is: a project may have been
 * downloaded, hand-edited or crafted. Nothing is followed out of the project's own folder,
 * and nothing is loaded that a project would not hold.
 */

/** A project document is a few kilobytes of JSON. Far beyond it, the file is not one. */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** Editors on Windows add one; `JSON.parse` refuses a document that starts with it. */
const BYTE_ORDER_MARK = '﻿';

const PROJECT_FOLDER = 'the project';

/** What is being written, for the messages the shared publishing code produces. */
const PROJECT_SUBJECT = 'project';
const SAVE_PREFIX = '.vitatheme-save-';

export interface FileSystemProjectStoreOptions {
  /**
   * Where work with no home of its own is kept: a project started and edited but never
   * saved anywhere. Supplied by the process that knows the platform's conventions, and
   * never written into a project document.
   */
  readonly untitledRecoveryPath: string;
}

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

const isMissing = (error: unknown): boolean => errorCode(error) === 'ENOENT';

const storeError = (code: ProjectStoreErrorCode, message: string): ProjectStoreError => ({
  code,
  message,
});

/** Failures from the shared publishing code, in this port's vocabulary. */
const fromExportFailure = (error: ThemeExportFailure): ProjectStoreError => {
  switch (error.code) {
    case 'destination-exists':
    case 'destination-invalid':
      return storeError('destination-invalid', error.message);
    case 'destination-unwritable':
      return storeError('destination-unwritable', error.message);
    default:
      return storeError('write-failed', error.message);
  }
};

const readDocumentAt = async (path: string): Promise<Result<string, ProjectStoreError>> => {
  let resolved: string;
  try {
    resolved = await realpath(path);
  } catch (error) {
    return failure(
      isMissing(error)
        ? storeError('not-found', 'That project is no longer there.')
        : storeError(
            'unreadable',
            `The project could not be opened: ${describeFileSystemError(error)}.`,
          ),
    );
  }

  try {
    const stats = await stat(resolved);
    if (!stats.isFile()) {
      return failure(
        storeError('not-a-file', 'That is not a project file. Choose a .vitatheme project.'),
      );
    }
    if (stats.size > MAX_DOCUMENT_BYTES) {
      return failure(
        storeError(
          'too-large',
          'That file is far larger than a project, and was not opened. A project is a few ' +
            'kilobytes of text; the artwork lives beside it.',
        ),
      );
    }

    const bytes = await readFileWithin(resolved, stats.size);
    const text = new TextDecoder('utf-8').decode(bytes);
    return success(text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text);
  } catch (error) {
    return failure(
      storeError('unreadable', `The project could not be read: ${describeFileSystemError(error)}.`),
    );
  }
};

/**
 * The files a project owns.
 *
 * The folder is examined with `lstat` and refused if it is a symbolic link: a project that
 * arrived from somewhere else must not be able to point its own asset folder at somebody's
 * home directory and have the application read from there. Links *inside* the folder are
 * refused too, by the containment rules every asset read already goes through.
 *
 * A project whose folder is missing still opens. Its files are then reported missing, which
 * is what the interface shows and what the person can put right, and is better than refusing
 * to open work that is otherwise intact.
 */
const openProjectAssets = async (projectPath: string): Promise<ThemeAssetSource> => {
  const assetsPath = projectAssetsPath(projectPath);

  try {
    const stats = await lstat(assetsPath);
    if (!stats.isDirectory()) {
      return emptyThemeAssetSource();
    }
  } catch {
    return emptyThemeAssetSource();
  }

  try {
    return folderAssetSource(await realpath(assetsPath), PROJECT_FOLDER);
  } catch {
    return emptyThemeAssetSource();
  }
};

const stageFile = async (
  destination: PreparedDestination,
  contents: string,
): Promise<Result<string, ProjectStoreError>> => {
  const stagingPath = temporarySiblingPath(destination.parentRealPath, SAVE_PREFIX);

  try {
    // `wx` fails rather than following or replacing anything already at the path.
    await writeFile(stagingPath, contents, { encoding: 'utf-8', flag: 'wx' });
    return success(stagingPath);
  } catch (error) {
    return failure(
      storeError(
        errorCode(error) === 'EACCES' || errorCode(error) === 'EPERM'
          ? 'destination-unwritable'
          : 'write-failed',
        `The project could not be written: ${describeFileSystemError(error)}.`,
      ),
    );
  }
};

const publish = async (
  stagingPath: string,
  destination: PreparedDestination,
): Promise<Result<void, ProjectStoreError>> => {
  const published = await publishAtomically(stagingPath, destination);
  if (!published.ok) {
    await removeQuietly(stagingPath);
    return failure(fromExportFailure(published.error));
  }
  return success(undefined);
};

/**
 * Writes one of a project's files into the staging folder.
 *
 * A theme may refer to a file inside a folder of its own, so the path is resolved rather
 * than assumed to be a plain name, and refused if it would not land inside the staging
 * folder. `wx` means nothing already at the path is followed or replaced.
 */
const writeAsset = async (
  stagingRealPath: string,
  path: ThemeAssetPath,
  contents: Uint8Array,
): Promise<Result<void, ProjectStoreError>> => {
  const resolved = await resolveNewFileWithin(stagingRealPath, path);
  if (resolved.status !== 'resolved') {
    return failure(
      storeError(
        'write-failed',
        resolved.status === 'unreadable'
          ? `"${path}" could not be prepared: ${resolved.reason}.`
          : `"${path}" would be written outside the project.`,
      ),
    );
  }

  try {
    await writeFile(resolved.absolutePath, contents, { flag: 'wx' });
    return success(undefined);
  } catch (error) {
    return failure(
      storeError(
        errorCode(error) === 'EACCES' || errorCode(error) === 'EPERM'
          ? 'destination-unwritable'
          : 'write-failed',
        `"${path}" could not be written: ${describeFileSystemError(error)}.`,
      ),
    );
  }
};

/**
 * Builds the folder of files beside the project, and moves it into place.
 *
 * Everything is written under a name nothing else knows and published in one step, so the
 * files a project refers to are either all the new ones or all the ones that were there
 * before. Each file is read and written one at a time: a theme's artwork is tens of
 * megabytes, and saving must not mean holding all of it at once.
 */
const writeAssets = async (
  projectPath: string,
  assets: ProjectAssets,
): Promise<Result<void, ProjectStoreError>> => {
  const prepared = await prepareDestination(
    projectAssetsPath(projectPath),
    'folder',
    true,
    PROJECT_SUBJECT,
  );
  if (!prepared.ok) {
    return failure(fromExportFailure(prepared.error));
  }

  const stagingPath = temporarySiblingPath(prepared.value.parentRealPath, SAVE_PREFIX);
  let stagingRealPath: string;
  try {
    // Not `recursive`: creating the staging folder must fail if the name is already taken.
    await mkdir(stagingPath);
    stagingRealPath = await realpath(stagingPath);
  } catch (error) {
    return failure(
      storeError(
        'write-failed',
        `The project's files could not be prepared: ${describeFileSystemError(error)}.`,
      ),
    );
  }

  for (const path of assets.paths) {
    const opened = await assets.open(path);
    if (!opened.ok) {
      await removeQuietly(stagingRealPath);
      return failure(storeError('asset-unreadable', opened.error.message));
    }

    const written = await writeAsset(stagingRealPath, path, opened.value);
    if (!written.ok) {
      await removeQuietly(stagingRealPath);
      return failure(written.error);
    }
  }

  return publish(stagingRealPath, prepared.value);
};

export const fileSystemProjectStore = ({
  untitledRecoveryPath,
}: FileSystemProjectStoreOptions): ProjectStore => {
  const recoveryPathOf = (location: RecoveryLocation): string =>
    location.kind === 'untitled' ? untitledRecoveryPath : projectRecoveryPath(location.path);

  const writeDocument = async (
    path: string,
    document: string,
  ): Promise<Result<void, ProjectStoreError>> => {
    // Replacing is the point: the save dialog has already asked, and saving again must not
    // start refusing because the project exists.
    const prepared = await prepareDestination(path, 'file', true, PROJECT_SUBJECT);
    if (!prepared.ok) {
      return failure(fromExportFailure(prepared.error));
    }

    const staged = await stageFile(prepared.value, document);
    return staged.ok ? publish(staged.value, prepared.value) : failure(staged.error);
  };

  return {
    read: async (path) => {
      const document = await readDocumentAt(path);
      if (!document.ok) {
        return failure(document.error);
      }

      return success<StoredProject>({
        document: document.value,
        assets: await openProjectAssets(path),
      });
    },

    exists: async (path) => {
      try {
        // `lstat`, so that a link where a project used to be is not mistaken for the project.
        return (await lstat(path)).isFile();
      } catch {
        return false;
      }
    },

    write: async (path, document, assets) => {
      // The files first, the document last: a project that has been published always refers
      // to files that are already beside it.
      if (assets !== null) {
        const written = await writeAssets(path, assets);
        if (!written.ok) {
          return written;
        }
      }

      return writeDocument(path, document);
    },

    readRecovery: async (location) => {
      const document = await readDocumentAt(recoveryPathOf(location));
      if (!document.ok) {
        return failure(document.error);
      }

      // Recovered work refers to the files of the project it belongs to; work that was never
      // saved anywhere has none of its own yet.
      return success<StoredProject>({
        document: document.value,
        assets:
          location.kind === 'project'
            ? await openProjectAssets(location.path)
            : emptyThemeAssetSource(),
      });
    },

    writeRecovery: async (location, document) => {
      const path = recoveryPathOf(location);

      try {
        await mkdir(dirname(path), { recursive: true });
      } catch (error) {
        return failure(
          storeError(
            'destination-unwritable',
            `Work in progress could not be kept: ${describeFileSystemError(error)}.`,
          ),
        );
      }

      return writeDocument(path, document);
    },

    hasRecovery: async (location) => {
      try {
        return (await lstat(recoveryPathOf(location))).isFile();
      } catch {
        return false;
      }
    },

    removeRecovery: async (location) => {
      try {
        await rm(recoveryPathOf(location), { force: true });
      } catch {
        // Nothing here is worth interrupting somebody's work for: the recovery document is
        // superseded, and being unable to delete it leaves only a stale offer to recover.
      }
    },
  };
};
