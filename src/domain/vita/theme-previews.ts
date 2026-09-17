import type { ThemeImageAssetKind } from './asset-specs';

/**
 * The three pictures a theme is browsed by, before any of it is on screen.
 *
 * They are not part of the theme the console applies: nothing here is drawn on the home
 * screen or the lock screen. They are what `InfomationProperty` points at so that a theme
 * can be recognised in a list —
 *
 * - `m_homePreviewFilePath` — how the home screen will look
 * - `m_startPreviewFilePath` — how the lock screen will look
 * - `m_packageImageFilePath` — the theme's thumbnail in the list itself
 *
 * — which is why a theme that leaves them out is still a theme, and why every rule about
 * them is `community-reported`: no source establishes what the console does with a preview
 * of the wrong size, or with none at all.
 *
 * The sizes live with every other asset's in `asset-specs.ts`. This module exists so that
 * the three can be named as a set, because they are generated, replaced and reported on as
 * a set.
 */

export const THEME_PREVIEW_KINDS = [
  'homePreview',
  'startScreenPreview',
  'packageThumbnail',
] as const satisfies readonly ThemeImageAssetKind[];

export type ThemePreviewKind = (typeof THEME_PREVIEW_KINDS)[number];

export const isThemePreviewKind = (value: string): value is ThemePreviewKind =>
  THEME_PREVIEW_KINDS.some((kind) => kind === value);
