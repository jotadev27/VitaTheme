/**
 * Where the list of projects somebody has worked on is kept.
 *
 * Deliberately dumb: it reads a list and writes a list, and knows nothing about ordering,
 * duplicates or how long the list may be. Those are decisions, and decisions live in the
 * application layer where they can be tested without a disk.
 *
 * What is stored is the least that a launcher needs — a name, where the project is, and when
 * it was last opened. No theme data, no artwork, nothing about the machine beyond the paths
 * the person themselves chose, and nothing that leaves it.
 */

export interface RecentProject {
  /**
   * Identifies the entry to the window, which is never told where a project is.
   *
   * Assigned when the entry is first remembered and kept from then on, so a list that has
   * been reordered still refers to the same projects.
   */
  readonly id: string;
  /** What to call the project: its own name, never a path. */
  readonly name: string;
  /** Where it is. Stays in this process; the window is given the id instead. */
  readonly path: string;
  /** When it was last opened or saved, as milliseconds since the epoch. */
  readonly openedAt: number;
}

export interface RecentProjectsStore {
  /**
   * The list as it was last written.
   *
   * The file is untrusted input like any other: anything that is not a list of entries this
   * application would have written comes back as an empty list rather than as a failure,
   * because a damaged list of shortcuts is not worth interrupting somebody's work for.
   */
  read(): Promise<readonly RecentProject[]>;
  write(entries: readonly RecentProject[]): Promise<void>;
}
