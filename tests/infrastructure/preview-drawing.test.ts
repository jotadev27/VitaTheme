import { describe, expect, it } from 'vitest';
import { imageConversionTarget, MAX_PALETTE_COLORS } from '@/domain/editing/image-conversion';
import type { CompositionLayer, RasterComposition } from '@/domain/editing/preview-composition';
import { composeImage } from '@/infrastructure/image/compose-image';
import { identifyMedia } from '@/infrastructure/media/media-probe';
import { distinctColorCount, pixelsOf, pngBytes } from '../support/image-fixtures';

/**
 * Drawing a composition.
 *
 * What is proved here is that the picture that comes out is an asset a theme can hold — the
 * exact size, a PNG this application reads back, a palette the format's convention allows —
 * and that it is the same picture every time. A preview is exported like anything else, so
 * it has to meet the same rules as anything else.
 */

const BLACK = { red: 0, green: 0, blue: 0, alpha: 255 };
const RED = { red: 255, green: 0, blue: 0, alpha: 255 };
const HALF_WHITE = { red: 255, green: 255, blue: 255, alpha: 128 };

const base = (width: number, height: number): CompositionLayer<Uint8Array> => ({
  kind: 'fill',
  rect: { x: 0, y: 0, width, height },
  color: BLACK,
});

const composition = (
  width: number,
  height: number,
  layers: readonly CompositionLayer<Uint8Array>[],
): RasterComposition => ({ width, height, layers: [base(width, height), ...layers] });

const drawn = async (
  source: RasterComposition,
  kind: 'homePreview' | 'packageThumbnail' = 'homePreview',
): Promise<Uint8Array> => {
  const result = await composeImage(source, imageConversionTarget(kind));
  if (!result.ok) {
    throw new Error(`the preview was not drawn: ${result.error.message}`);
  }
  return result.value.bytes;
};

describe('what a drawn preview turns out to be', () => {
  it('is exactly the size the slot asks for, whatever the canvas was', async () => {
    const bytes = await drawn(composition(960, 544, []));
    const media = identifyMedia(bytes);

    expect(media).toMatchObject({ kind: 'image', format: 'png', width: 480, height: 272 });
  });

  it('is an indexed eight-bit PNG with no transparency, like every other opaque asset', async () => {
    const wallpaper = await pngBytes({ width: 960, height: 512 });
    const bytes = await drawn(
      composition(960, 544, [
        {
          kind: 'image',
          rect: { x: 0, y: 32, width: 960, height: 512 },
          image: wallpaper,
          fit: 'cover',
          required: true,
        },
      ]),
    );

    expect(identifyMedia(bytes)).toMatchObject({
      kind: 'image',
      format: 'png',
      encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: false },
    });
    expect(await distinctColorCount(bytes)).toBeLessThanOrEqual(MAX_PALETTE_COLORS);
  });

  it('begins with the PNG signature', async () => {
    const bytes = await drawn(composition(226, 128, []), 'packageThumbnail');

    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('draws the same bytes for the same composition', async () => {
    const wallpaper = await pngBytes({ width: 960, height: 512 });
    const layers: CompositionLayer<Uint8Array>[] = [
      {
        kind: 'image',
        rect: { x: 0, y: 32, width: 960, height: 512 },
        image: wallpaper,
        fit: 'cover',
        required: true,
      },
      { kind: 'fill', rect: { x: 0, y: 0, width: 960, height: 32 }, color: RED },
    ];

    const first = await drawn(composition(960, 544, layers));
    const second = await drawn(composition(960, 544, layers));

    expect([...second]).toEqual([...first]);
  });
});

describe('what a composition puts where', () => {
  it('fills the rectangle it names and nothing else', async () => {
    const bytes = await drawn(
      composition(226, 128, [
        { kind: 'fill', rect: { x: 0, y: 0, width: 226, height: 32 }, color: RED },
      ]),
      'packageThumbnail',
    );
    const pixels = await pixelsOf(bytes);

    expect(pixels.at(10, 10).slice(0, 3)).toEqual([255, 0, 0]);
    expect(pixels.at(10, 100).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('lays a translucent layer over what is under it', async () => {
    const bytes = await drawn(
      composition(226, 128, [
        { kind: 'fill', rect: { x: 0, y: 0, width: 226, height: 128 }, color: HALF_WHITE },
      ]),
      'packageThumbnail',
    );
    const pixels = await pixelsOf(bytes);
    const [red = 0, , , alpha = 0] = pixels.at(100, 60);

    // White at half alpha over black: grey, and opaque, because the slot has no transparency.
    expect(red).toBeGreaterThan(100);
    expect(red).toBeLessThan(160);
    expect(alpha).toBe(255);
  });

  it('keeps a layer that hangs over the edge inside the picture', async () => {
    const bytes = await drawn(
      composition(226, 128, [
        { kind: 'fill', rect: { x: -40, y: -40, width: 80, height: 80 }, color: RED },
      ]),
      'packageThumbnail',
    );
    const pixels = await pixelsOf(bytes);

    expect(pixels.width).toBe(226);
    expect(pixels.at(10, 10).slice(0, 3)).toEqual([255, 0, 0]);
    expect(pixels.at(100, 100).slice(0, 3)).toEqual([0, 0, 0]);
  });
});

describe('artwork that cannot be drawn', () => {
  const malformed = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);

  it('refuses the whole preview when it is what the preview is of', async () => {
    const result = await composeImage(
      composition(960, 544, [
        {
          kind: 'image',
          rect: { x: 0, y: 32, width: 960, height: 512 },
          image: malformed,
          fit: 'cover',
          required: true,
        },
      ]),
      imageConversionTarget('homePreview'),
    );

    expect(result.ok).toBe(false);
  });

  it('is left out when the preview is still a picture of the theme without it', async () => {
    const wallpaper = await pngBytes({ width: 960, height: 512 });
    const result = await composeImage(
      composition(960, 544, [
        {
          kind: 'image',
          rect: { x: 0, y: 32, width: 960, height: 512 },
          image: wallpaper,
          fit: 'cover',
          required: true,
        },
        {
          kind: 'image',
          rect: { x: 100, y: 100, width: 128, height: 128 },
          image: malformed,
          fit: 'cover',
          required: false,
        },
      ]),
      imageConversionTarget('homePreview'),
    );

    expect(result.ok).toBe(true);
  });

  it('refuses a file that is not a picture at all', async () => {
    const result = await composeImage(
      composition(226, 128, [
        {
          kind: 'image',
          rect: { x: 0, y: 0, width: 226, height: 128 },
          image: new TextEncoder().encode('this is not a picture'),
          fit: 'cover',
          required: true,
        },
      ]),
      imageConversionTarget('packageThumbnail'),
    );

    expect(result.ok || result.error.code).toBe('not-an-image');
  });
});

describe('a composition this application would not draw', () => {
  it('is refused when it names a canvas of no size', async () => {
    const result = await composeImage(
      { width: 0, height: 0, layers: [] },
      imageConversionTarget('homePreview'),
    );

    expect(result.ok || result.error.code).toBe('failed');
  });

  it('is refused when it holds more layers than a screen has room for', async () => {
    const result = await composeImage(
      {
        width: 960,
        height: 544,
        layers: Array.from({ length: 200 }, () => base(960, 544)),
      },
      imageConversionTarget('homePreview'),
    );

    expect(result.ok || result.error.code).toBe('failed');
  });
});
