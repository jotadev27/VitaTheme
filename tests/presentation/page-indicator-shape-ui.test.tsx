import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import { ConvertAssetDialog } from '@/presentation/components/ConvertAssetDialog';

const markup = (slot: ThemeAssetSlot): string =>
  renderToStaticMarkup(
    <ConvertAssetDialog
      slot={slot}
      label="Test image"
      source={{ width: 128, height: 128, dataUrl: 'data:image/png;base64,AA==' }}
      busy={false}
      onCancel={() => undefined}
      onApply={() => undefined}
      loadSource={() => Promise.resolve(null)}
    />,
  );

describe('page indicator shape choice', () => {
  it.each([{ kind: 'basePageIndicator' }, { kind: 'currentPageIndicator' }] as const)(
    'offers square and circle for $kind',
    (slot) => {
      const html = markup(slot);
      expect(html).toContain(' Square</label>');
      expect(html).toContain(' Circle</label>');
    },
  );

  it.each([
    { kind: 'appIcon', application: 'settings' },
    { kind: 'noNoticeBadge' },
    { kind: 'newNoticeBadge' },
  ] as const)('does not offer shapes for $kind', (slot) => {
    expect(markup(slot)).not.toContain('class="crop-shape"');
  });
});
