import type { ReactElement } from 'react';
import type { SessionSnapshot, ThemeOriginKind } from '@/ipc';
import type { PendingAction, WorkspaceMode } from '../state/editor-state';
import type { EditorActions } from '../state/use-editor';
import {
  ArchiveIcon,
  FolderIcon,
  PlusIcon,
  RedoIcon,
  RefreshIcon,
  SaveIcon,
  UndoIcon,
} from './icons';
import { BrandLogo } from './BrandLogo';
import { Badge } from './primitives';

/**
 * The bar the application is driven from: what is open on the left, what can be done to it
 * on the right. Actions that make no sense without a theme are disabled rather than hidden,
 * so the application does not change shape underneath someone using it.
 */
/** Written out rather than detected, because it is what the application menu was given. */
const REDO_SHORTCUT = navigator.userAgent.includes('Mac') ? '\u21e7\u2318Z' : 'Ctrl+Y';
const UNDO_SHORTCUT = navigator.userAgent.includes('Mac') ? '\u2318Z' : 'Ctrl+Z';

const MODES: readonly { readonly id: WorkspaceMode; readonly label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'preview', label: 'Preview' },
];

/**
 * What the theme is, said in the words somebody would use for it.
 *
 * A project has somewhere to be saved back to; the other two do not, and saving them asks
 * where to put one.
 */
const ORIGIN_LABELS: Readonly<Record<ThemeOriginKind, string>> = {
  project: 'Project',
  folder: 'Theme folder',
  draft: 'Draft',
};

export const AppToolbar = ({
  session,
  pending,
  mode,
  actions,
}: {
  readonly session: SessionSnapshot;
  readonly pending: PendingAction;
  readonly mode: WorkspaceMode;
  readonly actions: EditorActions;
}): ReactElement => {
  const theme = session.theme;
  const busy = pending !== null;

  return (
    <header className="toolbar">
      <div className="toolbar-identity">
        <span className="toolbar-brand" aria-label="VitaTheme">
          <span className="toolbar-brand-mark">
            <BrandLogo className="toolbar-brand-image" variant="mark" />
          </span>
          <span className="toolbar-product">VitaTheme</span>
        </span>
        {theme === null ? null : (
          <span className="toolbar-theme">
            <span className="toolbar-theme-name" title={theme.label}>
              {theme.label}
            </span>
            {theme.isDirty ? (
              <span className="toolbar-unsaved" role="img" aria-label="Unsaved changes" />
            ) : null}
            <Badge>{ORIGIN_LABELS[theme.origin]}</Badge>
          </span>
        )}
      </div>

      {theme === null ? null : (
        <div className="segmented toolbar-modes" role="group" aria-label="Workspace">
          {MODES.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className="toggle"
              aria-pressed={mode === candidate.id}
              onClick={() => {
                actions.selectMode(candidate.id);
              }}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      <div className="toolbar-actions">
        <button
          type="button"
          className="btn btn-quiet toolbar-file-action"
          onClick={() => {
            actions.openDialog({ kind: 'new-theme' });
          }}
          title="Start a new theme"
        >
          <PlusIcon />
          <span className="toolbar-action-label">New</span>
        </button>
        <button
          type="button"
          className="btn btn-quiet toolbar-file-action"
          disabled={busy}
          onClick={() => {
            void actions.openProject();
          }}
          title="Open a saved VitaTheme project"
        >
          <FolderIcon />
          <span className="toolbar-action-label">Open</span>
        </button>
        <button
          type="button"
          className="btn btn-quiet toolbar-file-action"
          disabled={theme === null || busy}
          onClick={() => {
            void actions.saveProject();
          }}
          title={
            theme?.origin === 'project'
              ? 'Save the project'
              : 'Save this theme as a VitaTheme project'
          }
        >
          <SaveIcon />
          <span className="toolbar-action-label">{pending === 'saving' ? 'Saving…' : 'Save'}</span>
        </button>

        <span className="toolbar-divider" />

        <button
          type="button"
          className="btn btn-quiet btn-icon"
          disabled={theme?.canUndo !== true || busy}
          title={`Undo (${UNDO_SHORTCUT})`}
          aria-label={`Undo (${UNDO_SHORTCUT})`}
          onClick={() => {
            void actions.undo();
          }}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          disabled={theme?.canRedo !== true || busy}
          title={`Redo (${REDO_SHORTCUT})`}
          aria-label={`Redo (${REDO_SHORTCUT})`}
          onClick={() => {
            void actions.redo();
          }}
        >
          <RedoIcon />
        </button>

        <span className="toolbar-divider" />

        <button
          type="button"
          className="btn btn-quiet toolbar-check-action"
          disabled={theme === null || busy}
          onClick={() => {
            void actions.refreshTheme();
          }}
          title="Read the theme again and check it"
        >
          <RefreshIcon />
          <span className="toolbar-action-label">
            {pending === 'refreshing' ? 'Checking…' : 'Check again'}
          </span>
        </button>
        <button
          type="button"
          className="btn"
          disabled={theme === null || busy}
          onClick={() => {
            void actions.exportTheme('folder');
          }}
          title="Export a PS Vita theme folder — separate from the .vitatheme project"
        >
          <FolderIcon />
          Export folder
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={theme === null || busy}
          onClick={() => {
            void actions.exportTheme('archive');
          }}
          title="Export a PS Vita theme ZIP — separate from the .vitatheme project"
        >
          <ArchiveIcon />
          {pending === 'exporting' ? 'Exporting…' : 'Export ZIP'}
        </button>
      </div>
    </header>
  );
};
