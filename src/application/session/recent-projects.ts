import type { RecentProject } from '../ports/recent-projects-store';

/**
 * Which projects to offer next time, and in what order.
 *
 * Pure list arithmetic: given the list as it was and what just happened, there is exactly one
 * list it becomes. Nothing here touches a disk, and nothing decides whether a project can
 * actually be opened — that is the opening code's business, and it is the same code whether a
 * project was picked from this list or from a dialog.
 */

/**
 * How many projects are remembered.
 *
 * A launcher is for the work somebody is in the middle of, not an archive. Ten fits on the
 * welcome screen without scrolling and is enough to cover the projects anybody has open at
 * once; beyond that, the file dialog is the better tool.
 */
export const MAX_RECENT_PROJECTS = 10;

/** A name long enough for any project, short enough that a damaged file cannot grow the list. */
export const MAX_RECENT_NAME_LENGTH = 200;

export interface RememberedProject {
  readonly path: string;
  readonly name: string;
}

/**
 * The list after a project was opened or saved.
 *
 * A project already on the list keeps the identity it had — the window may be holding that
 * id — and moves to the top rather than appearing twice. Which project an entry is, is
 * decided by its path: the same project saved under a new name is still the same project.
 */
export const rememberRecentProject = (
  entries: readonly RecentProject[],
  project: RememberedProject,
  now: number,
  newId: () => string,
): readonly RecentProject[] => {
  const existing = entries.find((entry) => entry.path === project.path);

  const remembered: RecentProject = {
    id: existing?.id ?? newId(),
    name: project.name.slice(0, MAX_RECENT_NAME_LENGTH),
    path: project.path,
    openedAt: now,
  };

  return [remembered, ...entries.filter((entry) => entry.path !== project.path)].slice(
    0,
    MAX_RECENT_PROJECTS,
  );
};

/** The list after somebody took an entry off it. An id that is not on the list changes nothing. */
export const forgetRecentProject = (
  entries: readonly RecentProject[],
  id: string,
): readonly RecentProject[] => entries.filter((entry) => entry.id !== id);

/**
 * The list in the order it is offered: most recently worked on first.
 *
 * Sorted rather than assumed, because the list is read from a file that anything could have
 * written, and an entry with a nonsensical time should not decide what comes first.
 */
export const orderRecentProjects = (entries: readonly RecentProject[]): readonly RecentProject[] =>
  [...entries].sort((left, right) => right.openedAt - left.openedAt).slice(0, MAX_RECENT_PROJECTS);

/** The project to offer to reopen: the one that was worked on last, if there is one. */
export const lastRecentProject = (entries: readonly RecentProject[]): RecentProject | null =>
  orderRecentProjects(entries)[0] ?? null;
