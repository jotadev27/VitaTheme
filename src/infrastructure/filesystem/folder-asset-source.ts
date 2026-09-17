import { stat } from 'node:fs/promises';
import {
  MAX_THEME_ASSET_BYTES,
  type ThemeAssetReadError,
  type ThemeAssetSource,
} from '../../application/ports/theme-assets';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { failure, success, type Result } from '../../domain/shared/result';
import type { AssetLookup } from '../../domain/validation/asset-catalog';
import { identifyMedia, MEDIA_HEADER_BYTES } from '../media/media-probe';
import { describeFileSystemError, readFileWithin, resolveWithinRoot } from './contained-path';

/**
 * The files under a directory, read as a theme's assets and confined to that directory.
 *
 * Both a theme folder and a saved project keep their files this way, so the containment
 * rules are written once: every path is resolved inside the root, symbolic links included,
 * and anything that lands outside is refused rather than read. Error messages name the file
 * as the theme refers to it and never where the directory is on the machine.
 */

const inspectAsset = async (
  rootRealPath: string,
  path: ThemeAssetPath,
  container: string,
): Promise<AssetLookup> => {
  const resolved = await resolveWithinRoot(rootRealPath, path);

  switch (resolved.status) {
    case 'not-found':
      return { status: 'missing' };
    case 'escapes-root':
      return {
        status: 'unreadable',
        reason: `it resolves to a location outside ${container}`,
      };
    case 'unreadable':
      return { status: 'unreadable', reason: resolved.reason };
    case 'resolved':
      break;
  }

  try {
    const stats = await stat(resolved.absolutePath);
    if (!stats.isFile()) {
      return { status: 'unreadable', reason: 'it is not a regular file' };
    }

    const header = await readFileWithin(resolved.absolutePath, MEDIA_HEADER_BYTES);
    return {
      status: 'found',
      asset: { byteSize: stats.size, media: identifyMedia(header) },
    };
  } catch (error) {
    return { status: 'unreadable', reason: describeFileSystemError(error) };
  }
};

/**
 * Reads an asset in full, for copying it into an export or into a project.
 *
 * This is the only place a whole theme file is loaded, which is why the size ceiling lives
 * here: validation never needs more than a header, so nothing else can be made to read a
 * large file. A file that grew beyond the ceiling since it was validated is refused with an
 * explanation rather than being allowed to exhaust memory.
 */
const openAsset = async (
  rootRealPath: string,
  path: ThemeAssetPath,
  container: string,
): Promise<Result<Uint8Array, ThemeAssetReadError>> => {
  const resolved = await resolveWithinRoot(rootRealPath, path);

  switch (resolved.status) {
    case 'not-found':
      return failure({
        code: 'missing',
        message: `The theme references "${path}", but that file is not in ${container}.`,
      });
    case 'escapes-root':
      return failure({
        code: 'escapes-theme',
        message: `"${path}" resolves to a location outside ${container}.`,
      });
    case 'unreadable':
      return failure({
        code: 'unreadable',
        message: `"${path}" could not be read: ${resolved.reason}.`,
      });
    case 'resolved':
      break;
  }

  try {
    const stats = await stat(resolved.absolutePath);
    if (!stats.isFile()) {
      return failure({ code: 'not-a-file', message: `"${path}" is not a regular file.` });
    }
    if (stats.size > MAX_THEME_ASSET_BYTES) {
      return failure({
        code: 'too-large',
        message:
          `"${path}" is larger than ${String(MAX_THEME_ASSET_BYTES / (1024 * 1024))} MB and was ` +
          'not used. Theme assets are images and a single music track; check that the theme is ' +
          'not pointing at the wrong file.',
      });
    }

    return success(await readFileWithin(resolved.absolutePath, stats.size));
  } catch (error) {
    return failure({
      code: 'unreadable',
      message: `"${path}" could not be read: ${describeFileSystemError(error)}.`,
    });
  }
};

/**
 * `rootRealPath` must already be resolved: containment is decided against it, so a root
 * that still passes through a symbolic link would be the wrong thing to compare against.
 */
export const folderAssetSource = (rootRealPath: string, container: string): ThemeAssetSource => ({
  inspectAsset: (path) => inspectAsset(rootRealPath, path, container),
  openAsset: (path) => openAsset(rootRealPath, path, container),
});
