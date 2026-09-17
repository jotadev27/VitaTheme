import { parseThemeAssetPath } from './theme-asset-path';

/**
 * Turns a theme's title into a name it can be stored under.
 *
 * A title is written for people and may hold anything a keyboard produces; a file name has
 * to survive three filesystems. The result is checked with `parseThemeAssetPath`, the same
 * rule set every other path in the application goes through, so there is one definition of
 * what is safe to write rather than two that can drift apart.
 */

export const DEFAULT_THEME_FILE_NAME = 'Theme';

/** Conservative: comfortably inside the per-name limit of every target filesystem. */
const MAX_FILE_NAME_LENGTH = 64;

/** Path separators, and the characters Windows refuses in a name. */
const UNSAFE_CHARACTERS = /[\\/:*?"<>|]/g;

// eslint-disable-next-line no-control-regex -- matching control characters is the point of this check
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

const WHITESPACE_RUNS = /\s+/g;

/** Windows drops a trailing dot or space silently, which changes the name behind the author. */
const TRAILING_DOTS_AND_SPACES = /[. ]+$/;

export const themeFileName = (title: string): string => {
  const candidate = title
    .replace(CONTROL_CHARACTERS, '')
    .replace(UNSAFE_CHARACTERS, ' ')
    .replace(WHITESPACE_RUNS, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .replace(TRAILING_DOTS_AND_SPACES, '');

  const parsed = parseThemeAssetPath(candidate);
  return parsed.ok ? parsed.value : DEFAULT_THEME_FILE_NAME;
};
