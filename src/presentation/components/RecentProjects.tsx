import type { ReactElement } from 'react';
import type { RecentProject } from '@/ipc';
import { CloseIcon, SaveIcon } from './icons';

/**
 * The projects somebody was working on, offered on the way in.
 *
 * A list, not a gallery: a name, where it sits, and whether it is still there. Opening one is
 * the whole point of the row, so the row is the button; removing it from the list is a quiet
 * action at the end, because it is the rarer thing to want.
 *
 * Each entry is named by an identifier the privileged side assigned. Nothing here knows, or
 * can ask, where any of them are.
 */
export const RecentProjects = ({
  projects,
  busy,
  onOpen,
  onForget,
}: {
  readonly projects: readonly RecentProject[];
  readonly busy: boolean;
  readonly onOpen: (id: string) => void;
  readonly onForget: (id: string) => void;
}): ReactElement => {
  if (projects.length === 0) {
    return (
      <div className="recents">
        <h2 className="recents-title">Recent projects</h2>
        <p className="recents-empty">
          Projects you save appear here. Start a theme, or open one you already have.
        </p>
      </div>
    );
  }

  return (
    <div className="recents">
      <h2 className="recents-title">Recent projects</h2>
      <ul className="recents-list">
        {projects.map((project) => (
          <li key={project.id} className="recent" data-available={project.available}>
            <button
              type="button"
              className="recent-open"
              disabled={busy}
              title={
                project.available
                  ? `Open ${project.name}`
                  : `${project.name} was not found where it was last saved`
              }
              onClick={() => {
                onOpen(project.id);
              }}
            >
              <SaveIcon />
              <span className="recent-name">{project.name}</span>
              <span className="recent-folder">
                {project.available ? project.folder : 'Not found'}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-icon btn-small recent-forget"
              aria-label={`Remove ${project.name} from recent projects`}
              title="Remove from this list. The project itself is left alone."
              disabled={busy}
              onClick={() => {
                onForget(project.id);
              }}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
