/**
 * When the application may stop, and what has to be asked first.
 *
 * Closing the window and quitting are the same decision arriving by two routes, and the
 * question — what about the work that is not on disk? — must be asked once, whichever route
 * it came by. That much is obvious. What is not is that asking it at all cancels a quit:
 * the only way to hold a window open long enough to ask is to prevent its close, and Electron
 * reads a prevented close as "this window refuses to go", abandoning the quit it was in the
 * middle of. The window then closes, the answer having arrived, and the application is left
 * running with no window — quit, from the person's side, did nothing.
 *
 * So the decision is kept here rather than spread across the event handlers: whether somebody
 * asked to quit, whether they have already answered, and therefore whether the last window
 * going away should end the application or leave it waiting, as macOS expects of an
 * application whose windows are all closed.
 */

export interface ShutdownPolicyDependencies {
  /** Whether there is work that would be lost. */
  readonly hasUnsavedWork: () => boolean;
  /** Asks about that work. False means the person called the whole thing off. */
  readonly confirmDiscard: () => Promise<boolean>;
  readonly quit: () => void;
  /**
   * Whether an application with no windows is still an application. True on macOS, where
   * closing the last window leaves it in the dock; false everywhere else, where it ends.
   */
  readonly keepsRunningWithoutWindows: boolean;
}

/**
 * Every member is a function this object holds rather than a method on it, because they are
 * handed to Electron's event handlers and to the window, where `this` would not follow.
 */
export interface ShutdownPolicy {
  /** A window is open again, so nothing has been decided about this session. */
  readonly windowOpened: () => void;
  /**
   * Whether a window may close, asked while it is being taken away.
   *
   * Answered once: a close that follows a decision already made does not ask again, so
   * nobody sees the same question twice on the way out.
   */
  readonly confirmClose: () => Promise<boolean>;
  /**
   * The application was asked to quit. True when it may go ahead; false when the caller must
   * hold the quit back, because the question is being asked and the answer decides.
   */
  readonly requestQuit: () => boolean;
  /**
   * The last window has gone.
   *
   * Arrives by two routes — the window saying so, and the application saying so — because
   * Electron stops emitting `window-all-closed` once a quit is under way, which is exactly
   * the case this policy exists for. Saying it twice costs nothing.
   */
  readonly windowsClosed: () => void;
}

export const createShutdownPolicy = ({
  hasUnsavedWork,
  confirmDiscard,
  quit,
  keepsRunningWithoutWindows,
}: ShutdownPolicyDependencies): ShutdownPolicy => {
  let answered = false;
  let quitRequested = false;

  const confirmClose = async (): Promise<boolean> => {
    if (answered) {
      return true;
    }

    answered = await confirmDiscard();
    if (!answered) {
      // Called off: a quit that was waiting on this answer is no longer happening either.
      quitRequested = false;
    }

    return answered;
  };

  return {
    windowOpened: () => {
      answered = false;
      quitRequested = false;
    },

    confirmClose,

    requestQuit: () => {
      quitRequested = true;
      if (answered || !hasUnsavedWork()) {
        return true;
      }

      void confirmClose().then((allowed) => {
        if (allowed) {
          quit();
        }
      });

      return false;
    },

    windowsClosed: () => {
      if (quitRequested || !keepsRunningWithoutWindows) {
        quit();
      }
    },
  };
};
