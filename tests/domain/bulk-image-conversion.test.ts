import { describe, expect, it } from 'vitest';
import { incompatibleImageSlots } from '@/domain/editing/bulk-image-conversion';
import { withAssetAtSlot } from '@/domain/editing/theme-asset-slot';
import { newThemeProject } from '@/domain/model/theme-project';
import { summarizeThemeAssets } from '@/domain/validation/asset-inventory';
import { assetPath, foundAsset } from '../support/theme-fixtures';

describe('safe bulk image candidates', () => {
  it('includes only occupied convertible images, never music or console-default icons', () => {
    let project = newThemeProject({ title: 'Bulk', provider: 'Tests' });
    project = withAssetAtSlot(
      project,
      { kind: 'liveAreaBackground', page: 0 },
      assetPath('photo.jpg'),
    );
    project = withAssetAtSlot(
      project,
      { kind: 'appIcon', application: 'browser' },
      assetPath('icon.jpg'),
    );
    project = withAssetAtSlot(project, { kind: 'backgroundMusic' }, assetPath('music.at9'));
    const assets = summarizeThemeAssets(project, {
      lookup: (path) =>
        path.endsWith('.at9')
          ? foundAsset({ kind: 'audio', format: 'at9', sampleRate: 48000, channelCount: 2 }, 4096)
          : foundAsset(
              { kind: 'image', format: 'jpeg', width: 400, height: 400, encoding: null },
              2048,
            ),
    });

    expect(incompatibleImageSlots(project, assets)).toEqual([
      { kind: 'liveAreaBackground', page: 0 },
      { kind: 'appIcon', application: 'browser' },
    ]);
  });
});
