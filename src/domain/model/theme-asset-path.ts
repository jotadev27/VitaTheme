import { failure, success, type Result } from '../shared/result';

/**
 * A file reference inside a theme, relative to the theme root.
 *
 * Every path in a theme originates from an untrusted `theme.xml`, and the application both
 * reads and writes those files. Validation happens once, here, and the result is branded so
 * that an unchecked string cannot reach code that resolves or creates files.
 */
declare const themeAssetPathBrand: unique symbol;
export type ThemeAssetPath = string & { readonly [themeAssetPathBrand]: 'ThemeAssetPath' };

export type ThemeAssetPathError =
  | 'empty'
  | 'too-long'
  | 'control-characters'
  | 'absolute'
  | 'backslash-separator'
  | 'colon'
  | 'empty-segment'
  | 'traversal-segment'
  | 'reserved-device-name'
  | 'trailing-dot-or-space';

/** Conservative limit: comfortably under the per-name limit of every target filesystem. */
const MAX_PATH_LENGTH = 255;

/** C0 controls (NUL included) and DEL: never legitimate in a filename, common in crafted input. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point of this check
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

/**
 * Names Windows resolves to devices regardless of extension. A theme referencing one could
 * not be extracted on Windows, so it is rejected on every platform for consistency.
 */
const RESERVED_DEVICE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${String(index + 1)}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${String(index + 1)}`),
]);

const hasReservedDeviceName = (segment: string): boolean => {
  const [stem = ''] = segment.split('.');
  return RESERVED_DEVICE_NAMES.has(stem.toLowerCase());
};

export const parseThemeAssetPath = (raw: string): Result<ThemeAssetPath, ThemeAssetPathError> => {
  const value = raw.trim();

  if (value.length === 0) {
    return failure('empty');
  }
  if (value.length > MAX_PATH_LENGTH) {
    return failure('too-long');
  }
  if (CONTROL_CHARACTERS.test(value)) {
    return failure('control-characters');
  }
  if (value.includes('\\')) {
    return failure('backslash-separator');
  }
  // Blocks drive-relative paths (`C:file`) and NTFS alternate data streams (`name:stream`).
  if (value.includes(':')) {
    return failure('colon');
  }
  if (value.startsWith('/')) {
    return failure('absolute');
  }

  for (const segment of value.split('/')) {
    if (segment.length === 0) {
      return failure('empty-segment');
    }
    if (segment === '.' || segment === '..') {
      return failure('traversal-segment');
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      return failure('trailing-dot-or-space');
    }
    if (hasReservedDeviceName(segment)) {
      return failure('reserved-device-name');
    }
  }

  return success(value as ThemeAssetPath);
};

export const assetPathExtension = (path: ThemeAssetPath): string => {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex <= 0 ? '' : fileName.slice(dotIndex).toLowerCase();
};
