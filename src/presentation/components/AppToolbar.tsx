import { useRef, type ReactElement } from 'react';
import type { SessionSnapshot } from '@/ipc';
import type { PendingAction, WorkspaceMode } from '../state/editor-state';
import type { EditorActions } from '../state/use-editor';
import { ArchiveIcon, FolderIcon, RefreshIcon } from './icons';
import { BrandLogo } from './BrandLogo';

const MODES: readonly WorkspaceMode[] = ['edit', 'preview'];

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
  const exportMenu = useRef<HTMLDetailsElement>(null);
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
            <span
              className="toolbar-theme-name"
              title={theme.isDirty ? `${theme.label} — unsaved changes` : theme.label}
            >
              {theme.label}
              {theme.isDirty ? ' *' : ''}
            </span>
          </span>
        )}
      </div>

      {theme === null ? null : (
        <>
          <div className="toolbar-mode-switch" role="group" aria-label="Workspace mode">
            {MODES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={mode === candidate}
                onClick={() => {
                  actions.selectMode(candidate);
                }}
              >
                {candidate === 'edit' ? 'Edit' : 'Preview'}
              </button>
            ))}
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-quiet btn-icon"
              disabled={busy}
              aria-label={pending === 'refreshing' ? 'Checking theme' : 'Check theme again'}
              title={pending === 'refreshing' ? 'Checking theme…' : 'Check theme again'}
              onClick={() => {
                void actions.refreshTheme();
              }}
            >
              <RefreshIcon />
            </button>
            <details className="toolbar-export" ref={exportMenu}>
              <summary
                className="btn btn-primary"
                aria-label="Export theme"
                aria-disabled={busy}
                onClick={(event) => {
                  if (busy) event.preventDefault();
                }}
              >
                {pending === 'exporting' ? 'Exporting…' : 'Export'} <span aria-hidden>▾</span>
              </summary>
              <div className="toolbar-export-menu" role="group" aria-label="Export format">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (exportMenu.current !== null) exportMenu.current.open = false;
                    void actions.exportTheme('folder');
                  }}
                >
                  <FolderIcon /> Export folder…
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (exportMenu.current !== null) exportMenu.current.open = false;
                    void actions.exportTheme('archive');
                  }}
                >
                  <ArchiveIcon /> Export ZIP…
                </button>
              </div>
            </details>
          </div>
        </>
      )}
    </header>
  );
};
