/**
 * Community theme repositories accept themes as a ZIP archive of the theme folder and
 * reject anything over 30 MB, which is the practical ceiling for a shareable theme.
 * Background music dominates this budget: a few minutes of ATRAC9 runs to several megabytes.
 */
export const MAX_DISTRIBUTION_ARCHIVE_BYTES = 30 * 1024 * 1024;

/** Point at which the author is warned, leaving room for archive overhead. */
export const DISTRIBUTION_SIZE_WARNING_RATIO = 0.9;
