/**
 * Keeping work that is not on disk yet.
 *
 * Autosave never touches the project somebody saved: it writes a separate recovery document
 * that the application offers back after an interrupted session, and removes once the work
 * is saved properly. A recovery document is not a save, so it changes nothing about the
 * session — not the history, not whether there are unsaved changes, and not what the
 * interface shows.
 *
 * Writing is delayed until the editing stops. Changes arrive as whole actions rather than
 * keystrokes, but a colour being dragged still reports every shade it passes over, and a
 * disk should not hear about each of them.
 */

export interface AutosaveTimer {
  cancel(): void;
}

/**
 * Starting a delayed call, supplied by the process that has a clock. Keeping it out of here
 * is what lets the timing be tested without waiting for it.
 */
export type StartAutosaveTimer = (callback: () => void, delayMs: number) => AutosaveTimer;

export interface AutosaveDependencies {
  /** Whether there is work that is not on disk. Nothing is written, or even scheduled, when not. */
  readonly hasUnsavedWork: () => boolean;
  /** Writes the work in progress. Answers whether anything was written. */
  readonly writeRecovery: () => Promise<boolean>;
  readonly startTimer: StartAutosaveTimer;
  readonly delayMs: number;
}

export interface Autosave {
  /** Called after anything that may have changed the session. */
  noteChange(): void;
  /** Gives up any pending write: the work has been saved, or discarded, or is being closed. */
  cancel(): void;
}

/** Long enough that a burst of edits is one write, short enough to lose little to a crash. */
export const DEFAULT_AUTOSAVE_DELAY_MS = 2000;

export const createAutosave = ({
  hasUnsavedWork,
  writeRecovery,
  startTimer,
  delayMs,
}: AutosaveDependencies): Autosave => {
  let pending: AutosaveTimer | null = null;
  let writing = false;
  /** A change that arrived while a write was in flight, and so has not been written yet. */
  let changedWhileWriting = false;

  const cancel = (): void => {
    pending?.cancel();
    pending = null;
  };

  const schedule = (): void => {
    cancel();
    if (!hasUnsavedWork()) {
      return;
    }

    pending = startTimer(() => {
      pending = null;
      void run();
    }, delayMs);
  };

  const run = async (): Promise<void> => {
    // One write at a time. A change that arrives during one is written by the next, rather
    // than by a second write racing the first to the same file.
    if (writing) {
      changedWhileWriting = true;
      return;
    }

    if (!hasUnsavedWork()) {
      return;
    }

    writing = true;
    try {
      await writeRecovery();
    } finally {
      writing = false;
    }

    if (changedWhileWriting) {
      changedWhileWriting = false;
      schedule();
    }
  };

  return {
    noteChange: () => {
      if (writing) {
        changedWhileWriting = true;
        return;
      }
      schedule();
    },
    cancel: () => {
      changedWhileWriting = false;
      cancel();
    },
  };
};
