import { realpath, stat } from 'node:fs/promises';
import { failure, success, type Result } from '../../domain/shared/result';
import { THEME_XML_FILE_NAME } from '../../domain/vita/theme-xml-schema';
import type { ThemeFolder, ThemeFolderError } from '../../application/ports/theme-folder';
import { describeFileSystemError, readFileWithin, resolveWithinRoot } from './contained-path';
import { folderAssetSource } from './folder-asset-source';

/** How the theme's own files are described when one of them cannot be read. */
const THEME_FOLDER = 'the theme folder';

/**
 * A theme manifest is a few kilobytes. The cap stops a file that merely happens to be named
 * `theme.xml` from being loaded into memory in full before anything has validated it.
 */
const MAX_MANIFEST_BYTES = 1024 * 1024;

/** Editors on Windows commonly save `theme.xml` with a BOM; the XML parser must not see it. */
const BYTE_ORDER_MARK = '\uFEFF';

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

const readManifest = async (rootRealPath: string): Promise<Result<string, ThemeFolderError>> => {
  const resolved = await resolveWithinRoot(rootRealPath, THEME_XML_FILE_NAME);

  if (resolved.status !== 'resolved') {
    return failure({
      code: resolved.status === 'not-found' ? 'manifest-missing' : 'unreadable',
      message:
        resolved.status === 'not-found'
          ? `The folder has no ${THEME_XML_FILE_NAME}, so it is not a PS Vita theme.`
          : `${THEME_XML_FILE_NAME} could not be read.`,
    });
  }

  try {
    const stats = await stat(resolved.absolutePath);
    if (stats.size > MAX_MANIFEST_BYTES) {
      return failure({
        code: 'unreadable',
        message: `${THEME_XML_FILE_NAME} is unexpectedly large and was not loaded. A theme manifest is only a few kilobytes.`,
      });
    }

    const bytes = await readFileWithin(resolved.absolutePath, stats.size);
    const text = new TextDecoder('utf-8').decode(bytes);
    return success(text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text);
  } catch (error) {
    return failure({
      code: 'unreadable',
      message: `${THEME_XML_FILE_NAME} could not be read: ${describeFileSystemError(error)}.`,
    });
  }
};

/**
 * Opens a theme laid out as a folder.
 *
 * The root is resolved once, up front, and every later access is confined to it. Error
 * messages name only paths relative to the theme, never the location of the folder on the
 * user's machine.
 */
export const openThemeFolder = async (
  folderPath: string,
): Promise<Result<ThemeFolder, ThemeFolderError>> => {
  let rootRealPath: string;
  try {
    rootRealPath = await realpath(folderPath);
  } catch (error) {
    return failure(
      errorCode(error) === 'ENOENT'
        ? { code: 'not-found', message: 'The selected folder does not exist.' }
        : {
            code: 'unreadable',
            message: `The folder could not be opened: ${describeFileSystemError(error)}.`,
          },
    );
  }

  try {
    const stats = await stat(rootRealPath);
    if (!stats.isDirectory()) {
      return failure({
        code: 'not-a-directory',
        message: 'The selected path is a file. Choose the folder that contains the theme.',
      });
    }
  } catch (error) {
    return failure({
      code: 'unreadable',
      message: `The folder could not be opened: ${describeFileSystemError(error)}.`,
    });
  }

  return success({
    readManifest: () => readManifest(rootRealPath),
    ...folderAssetSource(rootRealPath, THEME_FOLDER),
  });
};
