import { withPreviewAsset, type ThemeProject } from '../model/theme-project';
import type { ThemeAssetPath } from '../model/theme-asset-path';
import { THEME_PREVIEW_KINDS, type ThemePreviewKind } from '../vita/theme-previews';
import type { ThemeAssetSlot } from './theme-asset-slot';

/**
 * Where each of a theme's three previews came from, and what that permits.
 *
 * A preview is in one of three states, and the difference matters every time the application
 * is about to draw one:
 *
 * - **missing** — the slot is empty. The console falls back to its own placeholder, and
 *   nothing is lost by filling it.
 * - **generated** — VitaTheme drew it from the theme's own artwork. Drawing it again is
 *   repeating work the application already did, so it may be replaced freely.
 * - **custom** — somebody chose, dropped or converted a picture for the slot. It is theirs.
 *   The application never replaces it on its own initiative; it replaces it only when
 *   somebody points at that slot and asks for it.
 *
 * Everything that puts a file in a preview slot by ordinary means goes through
 * `withAssetAtSlot`, which marks the slot custom. Only generation says otherwise.
 */

export type PreviewSource = 'generated' | 'custom' | 'missing';

/** The slot a preview lives in. The three kinds and the three slots share their names. */
export const previewAssetSlot = (kind: ThemePreviewKind): ThemeAssetSlot => ({ kind });

export const previewAssetPath = (
  project: ThemeProject,
  kind: ThemePreviewKind,
): ThemeAssetPath | null => project.metadata[kind];

export const previewSource = (project: ThemeProject, kind: ThemePreviewKind): PreviewSource => {
  if (previewAssetPath(project, kind) === null) {
    return 'missing';
  }
  return project.metadata.generatedPreviews.has(kind) ? 'generated' : 'custom';
};

/** Records a picture the application drew, in the slot it drew it for. */
export const withGeneratedPreview = (
  project: ThemeProject,
  kind: ThemePreviewKind,
  path: ThemeAssetPath,
): ThemeProject => withPreviewAsset(project, kind, path, 'generated');

/**
 * The previews a "generate these" request may cover without asking anybody anything.
 *
 * Everything except somebody else's work: an empty slot, and one holding a picture this
 * application drew earlier. A custom preview is left out, which is the whole of the rule
 * that a supplied preview is never replaced automatically.
 */
export const generatablePreviews = (project: ThemeProject): readonly ThemePreviewKind[] =>
  THEME_PREVIEW_KINDS.filter((kind) => previewSource(project, kind) !== 'custom');
