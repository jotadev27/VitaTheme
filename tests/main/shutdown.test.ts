import { describe, expect, it } from 'vitest';
import { createShutdownPolicy } from '@/main/app/shutdown';

/**
 * The ways out of the application, and the one question that has to survive all of them.
 *
 * Quitting is not "close the window and stop": asking about unsaved work holds the window
 * open, which Electron reads as a refusal to close and abandons the quit. These say what has
 * to happen instead, for every answer somebody can give.
 */

interface Harness {
  readonly policy: ReturnType<typeof createShutdownPolicy>;
  readonly quits: () => number;
  answer: boolean;
  unsavedWork: boolean;
  asked: number;
}

const harness = ({ keepsRunningWithoutWindows = true } = {}): Harness => {
  let quits = 0;
  const state = {
    answer: true,
    unsavedWork: false,
    asked: 0,
  };

  const policy = createShutdownPolicy({
    hasUnsavedWork: () => state.unsavedWork,
    confirmDiscard: () => {
      state.asked += 1;
      return Promise.resolve(state.answer);
    },
    quit: () => {
      quits += 1;
    },
    keepsRunningWithoutWindows,
  });

  return {
    policy,
    quits: () => quits,
    get answer() {
      return state.answer;
    },
    set answer(value: boolean) {
      state.answer = value;
    },
    get unsavedWork() {
      return state.unsavedWork;
    },
    set unsavedWork(value: boolean) {
      state.unsavedWork = value;
    },
    get asked() {
      return state.asked;
    },
    set asked(value: number) {
      state.asked = value;
    },
  };
};

describe('quitting with nothing to lose', () => {
  it('lets the quit go ahead without asking anything', () => {
    const application = harness();
    application.policy.windowOpened();

    expect(application.policy.requestQuit()).toBe(true);
    expect(application.asked).toBe(0);
  });

  it('finishes the quit once the window the guard held open has gone', async () => {
    const application = harness();
    application.policy.windowOpened();

    application.policy.requestQuit();
    // Electron asks the window to close on the way out, and the guard answers for it.
    await expect(application.policy.confirmClose()).resolves.toBe(true);
    application.policy.windowsClosed();

    expect(application.quits()).toBe(1);
  });
});

describe('quitting with work that is not on disk', () => {
  it('holds the quit back while the question is being asked', () => {
    const application = harness();
    application.policy.windowOpened();
    application.unsavedWork = true;

    expect(application.policy.requestQuit()).toBe(false);
  });

  it('quits once the work has been dealt with', async () => {
    const application = harness();
    application.policy.windowOpened();
    application.unsavedWork = true;

    application.policy.requestQuit();
    await Promise.resolve();
    await Promise.resolve();

    expect(application.asked).toBe(1);
    expect(application.quits()).toBe(1);
  });

  it('stops the quit when the person calls it off', async () => {
    const application = harness();
    application.policy.windowOpened();
    application.unsavedWork = true;
    application.answer = false;

    application.policy.requestQuit();
    await Promise.resolve();
    await Promise.resolve();

    expect(application.quits()).toBe(0);

    // And the cancelled quit is not still waiting: closing the window later leaves the
    // application running, as it would have without the quit.
    application.answer = true;
    await application.policy.confirmClose();
    application.policy.windowsClosed();
    expect(application.quits()).toBe(0);
  });

  it('asks once, however many times the closing arrives', async () => {
    const application = harness();
    application.policy.windowOpened();
    application.unsavedWork = true;

    await application.policy.confirmClose();
    await application.policy.confirmClose();
    application.policy.requestQuit();

    expect(application.asked).toBe(1);
  });
});

describe('closing the last window', () => {
  it('leaves the application running where the platform expects it to', async () => {
    const application = harness({ keepsRunningWithoutWindows: true });
    application.policy.windowOpened();

    await application.policy.confirmClose();
    application.policy.windowsClosed();

    expect(application.quits()).toBe(0);
  });

  it('ends the application where the platform expects that instead', async () => {
    const application = harness({ keepsRunningWithoutWindows: false });
    application.policy.windowOpened();

    await application.policy.confirmClose();
    application.policy.windowsClosed();

    expect(application.quits()).toBe(1);
  });

  it('starts again from nothing decided when a window is opened once more', async () => {
    const application = harness();
    application.policy.windowOpened();
    application.unsavedWork = true;

    await application.policy.confirmClose();
    application.policy.windowsClosed();
    application.policy.windowOpened();
    application.asked = 0;

    // The theme in the new window is a different theme, so it gets its own question.
    await application.policy.confirmClose();
    expect(application.asked).toBe(1);
  });
});
