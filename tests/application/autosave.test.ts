import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAutosave,
  type Autosave,
  type AutosaveTimer,
  type StartAutosaveTimer,
} from '@/application/session/autosave';

/**
 * When work in progress is written, and when it is not.
 *
 * The clock is handed in, so the waiting is decided here rather than waited out: what these
 * check is the policy — nothing is written while there is nothing to write, a burst of edits
 * costs one write rather than forty, and a write never overlaps another or starts a loop.
 */

const DELAY = 2000;

interface ManualClock {
  readonly start: StartAutosaveTimer;
  /** Runs whatever is due, as the clock reaching the delay would. */
  readonly fire: () => void;
  readonly pending: () => number;
}

const manualClock = (): ManualClock => {
  let callbacks: (() => void)[] = [];

  return {
    start: (callback, delayMs): AutosaveTimer => {
      expect(delayMs).toBe(DELAY);
      callbacks.push(callback);
      return {
        cancel: () => {
          callbacks = callbacks.filter((candidate) => candidate !== callback);
        },
      };
    },
    fire: () => {
      const due = callbacks;
      callbacks = [];
      for (const callback of due) {
        callback();
      }
    },
    pending: () => callbacks.length,
  };
};

let clock: ManualClock;
let unsaved: boolean;
let writes: number;
let finishWrite: (() => void) | null;
let autosave: Autosave;

const build = (write?: () => Promise<boolean>): Autosave =>
  createAutosave({
    hasUnsavedWork: () => unsaved,
    writeRecovery:
      write ??
      (() => {
        writes += 1;
        return Promise.resolve(true);
      }),
    startTimer: clock.start,
    delayMs: DELAY,
  });

beforeEach(() => {
  clock = manualClock();
  unsaved = true;
  writes = 0;
  finishWrite = null;
  autosave = build();
});

describe('keeping work in progress', () => {
  it('writes nothing until the editing stops', () => {
    autosave.noteChange();

    expect(writes).toBe(0);

    clock.fire();

    expect(writes).toBe(1);
  });

  it('turns a burst of changes into one write', () => {
    for (let change = 0; change < 40; change += 1) {
      autosave.noteChange();
    }

    expect(clock.pending()).toBe(1);

    clock.fire();

    expect(writes).toBe(1);
  });

  it('does not so much as set a timer while there is nothing unsaved', () => {
    unsaved = false;

    autosave.noteChange();

    expect(clock.pending()).toBe(0);
  });

  it('writes nothing when the work was saved before the moment arrived', () => {
    autosave.noteChange();
    unsaved = false;

    clock.fire();

    expect(writes).toBe(0);
  });

  it('gives up a pending write when it is called off', () => {
    autosave.noteChange();

    autosave.cancel();
    clock.fire();

    expect(writes).toBe(0);
  });
});

describe('never two at once', () => {
  beforeEach(() => {
    autosave = build(
      () =>
        new Promise<boolean>((resolve) => {
          writes += 1;
          finishWrite = () => {
            resolve(true);
          };
        }),
    );
  });

  it('holds a change that arrives mid-write until that write is done', async () => {
    autosave.noteChange();
    clock.fire();
    expect(writes).toBe(1);

    autosave.noteChange();
    expect(writes).toBe(1);

    finishWrite?.();
    await Promise.resolve();
    await Promise.resolve();

    // Scheduled again rather than written at once: the editing may still be going on.
    expect(clock.pending()).toBe(1);
    clock.fire();
    expect(writes).toBe(2);
  });

  it('stops after the last change rather than writing for ever', async () => {
    autosave.noteChange();
    clock.fire();
    finishWrite?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(clock.pending()).toBe(0);
    expect(writes).toBe(1);
  });
});
