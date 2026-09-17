import type { ReactElement } from 'react';
import type { RecentProject } from '@/ipc';
import type { EditorActions } from '../state/use-editor';
import { BrandLogo } from './BrandLogo';
import { FolderIcon, PlusIcon, SaveIcon } from './icons';
import { RecentProjects } from './RecentProjects';

/**
 * What the application shows before a theme is open.
 *
 * Three ways in, the projects already being worked on, and a plain statement of what the tool
 * does. No banner, no artwork, nothing that has to be scrolled past to reach the only things
 * worth doing here.
 */
export const WelcomeView = ({
  actions,
  recentProjects,
  busy,
}: {
  readonly actions: EditorActions;
  readonly recentProjects: readonly RecentProject[];
  readonly busy: boolean;
}): ReactElement => (
  <main className="welcome">
    <div className="welcome-intro">
      <div className="welcome-brand">
        <BrandLogo className="welcome-logo" variant="lockup" />
      </div>
      <p className="muted">
        Create, preview and export PS Vita themes. VitaTheme checks the artwork before it reaches
        your console and only confirmed format problems can stop an export.
      </p>
    </div>

    <div className="welcome-actions">
      <button
        type="button"
        className="welcome-action"
        onClick={() => {
          actions.openDialog({ kind: 'new-theme' });
        }}
      >
        <span className="welcome-action-title">
          <PlusIcon /> New theme
        </span>
        <span className="welcome-action-hint">Start from nothing and add artwork as you go.</span>
      </button>

      <button
        type="button"
        className="welcome-action"
        onClick={() => {
          void actions.openProject();
        }}
      >
        <span className="welcome-action-title">
          <SaveIcon /> Open project
        </span>
        <span className="welcome-action-hint">
          A .vitatheme project saved here earlier, with its artwork beside it.
        </span>
      </button>

      <button
        type="button"
        className="welcome-action"
        onClick={() => {
          void actions.openThemeFolder();
        }}
      >
        <span className="welcome-action-title">
          <FolderIcon /> Open theme folder
        </span>
        <span className="welcome-action-hint">
          Import a folder holding theme.xml and its artwork without changing the original.
        </span>
      </button>
    </div>

    <RecentProjects
      projects={recentProjects}
      busy={busy}
      onOpen={(id) => {
        void actions.openRecentProject(id);
      }}
      onForget={(id) => {
        void actions.forgetRecentProject(id);
      }}
    />

    <p className="welcome-footnote">
      A <strong>.vitatheme project</strong> is your editable work. A <strong>PS Vita theme</strong>{' '}
      is the folder or ZIP you export for the console. Nothing is uploaded, and a theme folder you
      open is never modified in place.
    </p>
  </main>
);
