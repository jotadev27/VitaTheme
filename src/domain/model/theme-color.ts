import { failure, success, type Result } from '../shared/result';

/**
 * A colour as written in `theme.xml`.
 *
 * The console accepts both `RRGGBB` and `AARRGGBB`; real themes mix the two within a
 * single file. Whether the author wrote an alpha channel is preserved so that re-exporting
 * an imported theme does not change its meaning.
 */
export interface ThemeColor {
  readonly alpha: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly hasExplicitAlpha: boolean;
}

export type ThemeColorParseError = 'empty' | 'unsupported-length' | 'non-hexadecimal-characters';

const OPAQUE_ALPHA = 0xff;
const RGB_DIGITS = 6;
const ARGB_DIGITS = 8;
const HEXADECIMAL = /^[0-9a-fA-F]+$/;

const byteAt = (digits: string, index: number): number =>
  Number.parseInt(digits.slice(index, index + 2), 16);

export const parseThemeColor = (raw: string): Result<ThemeColor, ThemeColorParseError> => {
  const digits = raw.trim();

  if (digits.length === 0) {
    return failure('empty');
  }
  if (digits.length !== RGB_DIGITS && digits.length !== ARGB_DIGITS) {
    return failure('unsupported-length');
  }
  if (!HEXADECIMAL.test(digits)) {
    return failure('non-hexadecimal-characters');
  }

  const hasExplicitAlpha = digits.length === ARGB_DIGITS;
  const rgb = hasExplicitAlpha ? digits.slice(2) : digits;

  return success({
    alpha: hasExplicitAlpha ? byteAt(digits, 0) : OPAQUE_ALPHA,
    red: byteAt(rgb, 0),
    green: byteAt(rgb, 2),
    blue: byteAt(rgb, 4),
    hasExplicitAlpha,
  });
};

const toHexByte = (value: number): string => value.toString(16).toUpperCase().padStart(2, '0');

/** Serialises back to the exact notation the theme used, normalising only the digit case. */
export const formatThemeColor = (color: ThemeColor): string => {
  const rgb = `${toHexByte(color.red)}${toHexByte(color.green)}${toHexByte(color.blue)}`;
  return color.hasExplicitAlpha ? `${toHexByte(color.alpha)}${rgb}` : rgb;
};

export const opaqueColor = (red: number, green: number, blue: number): ThemeColor => ({
  alpha: OPAQUE_ALPHA,
  red,
  green,
  blue,
  hasExplicitAlpha: false,
});
