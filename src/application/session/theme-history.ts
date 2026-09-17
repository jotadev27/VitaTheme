import type { ThemeEdit } from '../../domain/editing/theme-edit';
import type { InspectedAsset } from '../../domain/model/media';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import type { ThemeProject } from '../../domain/model/theme-project';
import type { ExternalFile } from '../ports/external-file';

/**
 * What can be taken back, and what can be put back.
 *
 * Kept apart from the session because it is decided entirely by the moves made: given what
 * the history was and what just happened, there is exactly one thing it becomes. The session
 * owns the theme; this owns the trail behind it.
 */

/**
 * Something that is part of the theme but is not in it yet.
 *
 * A file somebody chose stays where it is and is read from there, so it can be replaced or
 * removed behind the application's back and is examined again every time. A picture this
 * application produced has nowhere else to be, so it is held as it was made — which also
 * means it cannot change underneath the theme that refers to it.
 */
export type StagedAsset =
  | { readonly kind: 'file'; readonly file: ExternalFile }
  | {
      readonly kind: 'converted';
      readonly bytes: Uint8Array;
      readonly inspected: InspectedAsset;
      /**
       * Tells one conversion from another.
       *
       * Converting twice puts two different pictures in the theme under the same name, and
       * whether there is unsaved work is decided by comparing what would be written.
       */
      readonly id: string;
    };

/** What identifies the file behind a name, for telling one version of a theme from another. */
export const stagedAssetIdentity = (asset: StagedAsset): string =>
  asset.kind === 'file' ? `file:${asset.file.reference}` : `converted:${asset.id}`;

/**
 * A theme as it stood, in two references.
 *
 * `ThemeProject` is immutable and shares everything an edit did not touch, and it holds file
 * *names* rather than files — so remembering a version of a theme costs a pointer, and a
 * history of them holds no image or audio data at all. `staged` goes with it because a file
 * brought in keeps its slot's name when it is replaced: restoring the project alone would
 * leave the name pointing at the wrong file.
 */
export interface ThemeVersion {
  readonly project: ThemeProject;
  readonly staged: ReadonlyMap<ThemeAssetPath, StagedAsset>;
}

/**
 * `past` ends with the version before the last change; `future` holds versions that were
 * taken back, nearest first. Making a change after taking one back discards `future`, which
 * is what everybody expects of an editor.
 */
export interface ThemeHistory {
  readonly past: readonly ThemeVersion[];
  readonly future: readonly ThemeVersion[];
  /**
   * What the change on top of `past` was about, when it is the sort that arrives in a stream.
   * Dragging through a colour picker is one thing somebody did, not forty.
   */
  readonly coalescingKey: string | null;
}

export const NO_HISTORY: ThemeHistory = { past: [], future: [], coalescingKey: null };

/**
 * How many changes back it is possible to go.
 *
 * Each step is a handful of pointers, so this is generous rather than careful; it exists so
 * that a session left open for a day does not grow without limit.
 */
const MAX_HISTORY_DEPTH = 200;

/**
 * Changes that arrive continuously from one gesture, and what they are about.
 *
 * A colour picker reports every colour the pointer passes over, so consecutive changes to the
 * same colour collapse into one step. Everything else is committed deliberately — text and
 * numbers when the field is left, everything else by a click — and each is its own step.
 */
export const coalescingKeyOf = (edit: ThemeEdit): string | null => {
  if (edit.kind !== 'set-color') {
    return null;
  }

  return edit.slot.kind === 'bubbleFont'
    ? `${edit.kind}:${edit.slot.kind}:${String(edit.slot.page)}`
    : `${edit.kind}:${edit.slot.kind}`;
};

/**
 * The history after a change, given the version it replaced.
 *
 * A gesture that reports continuously replaces its own last step rather than adding one, and
 * changing something after taking a change back gives up what was taken back.
 */
export const historyAfterChange = (
  history: ThemeHistory,
  replaced: ThemeVersion,
  coalescingKey: string | null,
): ThemeHistory => ({
  past:
    coalescingKey !== null && coalescingKey === history.coalescingKey
      ? history.past
      : [...history.past, replaced].slice(-MAX_HISTORY_DEPTH),
  future: [],
  coalescingKey,
});

export const historyAfterUndo = (history: ThemeHistory, replaced: ThemeVersion): ThemeHistory => ({
  past: history.past.slice(0, -1),
  future: [replaced, ...history.future].slice(0, MAX_HISTORY_DEPTH),
  coalescingKey: null,
});

export const historyAfterRedo = (history: ThemeHistory, replaced: ThemeVersion): ThemeHistory => ({
  past: [...history.past, replaced].slice(-MAX_HISTORY_DEPTH),
  future: history.future.slice(1),
  coalescingKey: null,
});
