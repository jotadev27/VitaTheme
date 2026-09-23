import { describe, expect, it } from 'vitest';
import { previewCacheAfterResponse } from '@/presentation/components/asset-previews';
import { badgeForNotificationState } from '@/presentation/preview/ScreenFrame';
import type { InformationBarPreview } from '@/presentation/preview/screen-model';

describe('asset preview revision', () => {
  it('ignores an old response after replacement or undo reuses the same path', () => {
    const old = previewCacheAfterResponse(
      { revision: 1, entries: new Map() },
      1,
      1,
      'badge.png',
      'old',
    );
    const current = previewCacheAfterResponse(old, 2, 2, 'badge.png', 'replacement');
    const late = previewCacheAfterResponse(current, 2, 1, 'badge.png', 'old');
    expect(late.entries.get('badge.png')).toBe('replacement');
    const undone = previewCacheAfterResponse(late, 3, 3, 'badge.png', 'old again');
    expect(undone.entries.get('badge.png')).toBe('old again');
  });

  it('uses the selected badge state without substituting the other artwork', () => {
    const noNoticeBadge = { state: 'ready', path: 'none.png' };
    const newNoticeBadge = { state: 'ready', path: 'waiting.png' };
    const bar = { noNoticeBadge, newNoticeBadge } as InformationBarPreview;
    expect(badgeForNotificationState(bar, 'none')).toBe(noNoticeBadge);
    expect(badgeForNotificationState(bar, 'waiting')).toBe(newNoticeBadge);
    const absent = {
      ...bar,
      noNoticeBadge: { state: 'unset', label: 'Not set' },
    } as InformationBarPreview;
    expect(badgeForNotificationState(absent, 'none')).toBe(absent.noNoticeBadge);
  });
});
