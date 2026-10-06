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
        <BrandLogo className="welcome-logo" variant="transparent-mark" />
        <h1>VitaTheme</h1>
      </div>
      <p className="muted">Create, preview and export PS Vita themes.</p>
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
        <span className="welcome-action-hint">Start a blank theme.</span>
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
        <span className="welcome-action-hint">Continue a .vitatheme project.</span>
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
        <span className="welcome-action-hint">Import a folder containing theme.xml.</span>
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
      is the folder or ZIP you export for the console.
    </p>
  </main>
);
