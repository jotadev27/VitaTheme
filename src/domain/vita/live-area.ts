/**
 * The PS Vita home screen is split into LiveArea pages. A theme may style up to ten of
 * them; a theme that styles fewer is valid, the remaining pages keep the system default.
 */
export const MAX_LIVE_AREA_PAGES = 10;
export const MIN_LIVE_AREA_PAGES = 1;

/**
 * Index of the stock animated "wave" background shown while swiping between pages.
 *
 * The console accepts a small integer here, but no authoritative list of indices to
 * colours is known, so no upper bound is enforced. Treated as opaque data and preserved
 * verbatim when a theme is imported and written back.
 */
export const WAVE_TYPE_IS_DOCUMENTED = false;
