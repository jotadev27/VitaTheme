import { describe, expect, it } from 'vitest';
import {
  imageConversionTarget,
  imageConversionWouldChange,
  isConvertibleImage,
  MAX_PALETTE_COLORS,
} from '@/domain/editing/image-conversion';
import type { ImageEncoding, MediaDescriptor } from '@/domain/model/media';
import { allImageAssetSpecs, imageAssetSpec, MAX_IMAGE_BIT_DEPTH } from '@/domain/vita/asset-specs';

/**
 * What a picture has to become for a slot.
 *
 * The targets are not written down here: they are derived from the same specifications the
 * validator checks against, and these tests hold the two together — a target that did not
 * satisfy the spec would be a conversion that produces work the validator then complains
 * about.
 */

const INDEXED: ImageEncoding = { bitDepth: 8, colorModel: 'indexed', hasTransparency: false };

const png = (
  width: number,
  height: number,
  encoding: ImageEncoding | null = INDEXED,
): MediaDescriptor => ({ kind: 'image', format: 'png', width, height, encoding });

describe('what a slot needs', () => {
  it('asks for exactly the size the specification requires, for every asset', () => {
    for (const spec of allImageAssetSpecs()) {
      const target = imageConversionTarget(spec.kind);

      expect([spec.kind, target.width, target.height]).toEqual([
        spec.kind,
        spec.width,
        spec.height,
      ]);
    }
  });

  it('always asks for a PNG, which is the only image a theme may use', () => {
    for (const spec of allImageAssetSpecs()) {
      expect(imageConversionTarget(spec.kind).format).toBe('png');
    }
  });

  it('asks for the bit depth themes are authored at', () => {
    for (const spec of allImageAssetSpecs()) {
      expect(imageConversionTarget(spec.kind).bitDepth).toBe(MAX_IMAGE_BIT_DEPTH);
    }
  });

  it('reduces to a palette exactly where the format uses no transparency', () => {
    for (const spec of allImageAssetSpecs()) {
      const target = imageConversionTarget(spec.kind);
      const opaque = spec.transparency === 'unsupported';

      expect([spec.kind, target.colorModel]).toEqual([
        spec.kind,
        opaque ? 'indexed' : 'truecolor-alpha',
      ]);
      expect([spec.kind, target.maxColors]).toEqual([
        spec.kind,
        opaque ? MAX_PALETTE_COLORS : null,
      ]);
      expect([spec.kind, target.flatten]).toEqual([spec.kind, opaque]);
    }
  });

  it('keeps transparency for the assets the format has transparency for', () => {
    for (const kind of ['appIcon', 'pageIndicator', 'notificationBadge'] as const) {
      expect(imageAssetSpec(kind).transparency).toBe('supported');
      expect(imageConversionTarget(kind).flatten).toBe(false);
    }
  });
});

describe('whether converting would do anything', () => {
  const target = imageConversionTarget('liveAreaBackground');

  it('says no when the picture is already what the slot takes', () => {
    expect(imageConversionWouldChange(target, png(960, 512))).toBe(false);
  });

  it.each([
    ['a different size', png(1920, 1080)],
    [
      'the wrong format',
      { kind: 'image', format: 'jpeg', width: 960, height: 512, encoding: null },
    ] satisfies [string, MediaDescriptor],
    [
      'a colour model the asset is not written with',
      png(960, 512, { bitDepth: 8, colorModel: 'truecolor', hasTransparency: false }),
    ],
    [
      'more bits per channel than a theme uses',
      png(960, 512, { bitDepth: 16, colorModel: 'indexed', hasTransparency: false }),
    ],
    [
      'transparency the console would compose away',
      png(960, 512, { bitDepth: 8, colorModel: 'indexed', hasTransparency: true }),
    ],
    ['an encoding nothing could determine', png(960, 512, null)],
  ])('says yes for %s', (_case, media) => {
    expect(imageConversionWouldChange(target, media)).toBe(true);
  });

  it('says yes for a file that is not a picture at all', () => {
    expect(imageConversionWouldChange(target, { kind: 'unrecognized' })).toBe(true);
    expect(isConvertibleImage({ kind: 'unrecognized' })).toBe(false);
  });

  it('leaves a transparent icon alone when it is already the right shape', () => {
    const icon = png(128, 128, {
      bitDepth: 8,
      colorModel: 'truecolor-alpha',
      hasTransparency: true,
    });

    expect(imageConversionWouldChange(imageConversionTarget('appIcon'), icon)).toBe(false);
  });
});
