import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NOTICE_FADE_MS,
  NOTICE_VISIBLE_MS,
  scheduleNoticeDismissal,
} from '@/presentation/components/NoticeToast';

afterEach(() => {
  vi.useRealTimers();
});

describe('notification lifetime', () => {
  it('fades a normal notice after five seconds and dismisses after the transition', () => {
    vi.useFakeTimers();
    const fade = vi.fn();
    const dismiss = vi.fn();
    const cleanup = scheduleNoticeDismissal('success', fade, dismiss);
    vi.advanceTimersByTime(NOTICE_VISIBLE_MS - 1);
    expect(fade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fade).toHaveBeenCalledOnce();
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(NOTICE_FADE_MS);
    expect(dismiss).toHaveBeenCalledOnce();
    cleanup();
  });

  it('cleans up both timers on manual dismissal or replacement', () => {
    vi.useFakeTimers();
    const fade = vi.fn();
    const dismiss = vi.fn();
    const cleanup = scheduleNoticeDismissal('success', fade, dismiss);
    cleanup();
    vi.advanceTimersByTime(6000);
    expect(fade).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('keeps errors until a person dismisses them', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    scheduleNoticeDismissal('error', vi.fn(), dismiss);
    vi.advanceTimersByTime(60_000);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
