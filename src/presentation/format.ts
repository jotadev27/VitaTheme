import { type ThemeColor } from '@/domain/model/theme-color';

/**
 * Turning values into something readable. Presentation only: nothing here decides anything
 * about a theme, it only decides how a number or a name looks on screen.
 */

const OPAQUE = 255;

/**
 * A theme colour as a stylesheet can use it.
 *
 * Transparency is part of several of these colours, so it is carried through rather than
 * flattened: a notification panel that is meant to be seen through should look that way.
 */
export const cssColor = (color: ThemeColor | null): string | null =>
  color === null
    ? null
    : `rgb(${String(color.red)} ${String(color.green)} ${String(color.blue)} / ${String(
        Math.round((color.alpha / OPAQUE) * 100),
      )}%)`;

const BYTES_IN_KIB = 1024;
const UNITS = ['bytes', 'KB', 'MB', 'GB'] as const;

export const formatByteSize = (bytes: number): string => {
  if (bytes < BYTES_IN_KIB) {
    return `${String(bytes)} ${UNITS[0]}`;
  }

  let value = bytes;
  let unit = 0;
  while (value >= BYTES_IN_KIB && unit < UNITS.length - 1) {
    value /= BYTES_IN_KIB;
    unit += 1;
  }

  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} ${UNITS[unit] ?? 'bytes'}`;
};

export const formatPixels = (width: number, height: number): string =>
  `${String(width)} × ${String(height)}`;

export const formatCount = (count: number, singular: string, plural = `${singular}s`): string =>
  `${String(count)} ${count === 1 ? singular : plural}`;
