import type { SpecConfidence } from './asset-specs';

/** Placement of the clock and date on the start (lock) screen. */
export interface DateLayoutOption {
  readonly value: number;
  readonly label: string;
}

export const DATE_LAYOUT_OPTIONS: readonly DateLayoutOption[] = [
  { value: 0, label: 'Lower left' },
  { value: 1, label: 'Upper left' },
  { value: 2, label: 'Lower right' },
];

/**
 * Only one community source describes these values, so an unrecognised layout is reported
 * as a warning rather than rejected: the console may well accept indices we do not know of.
 */
export const DATE_LAYOUT_CONFIDENCE: SpecConfidence = 'community-reported';

export const isDocumentedDateLayout = (value: number): boolean =>
  DATE_LAYOUT_OPTIONS.some((option) => option.value === value);
