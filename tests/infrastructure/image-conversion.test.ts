import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_PIXELS, MAX_SOURCE_SIDE } from '@/application/ports/image-converter';
import { imageConversionTarget } from '@/domain/editing/image-conversion';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import { convertImage } from '@/infrastructure/image/convert-image';
import { identifyMedia } from '@/infrastructure/media/media-probe';
import { pngHeaderBytes } from '../support/binary-fixtures';
import {
  bmpBytes,
  distinctColorCount,
  jpegBytes,
  pixelsOf,
  pngBytes,
} from '../support/image-fixtures';

/**
 * Turning a picture into a theme asset.
 *
 * What matters here is the result rather than the method: the bytes that come out are read
 * back through the application's own image identification, which is the same thing the
 * validator is later given. A conversion the validator would still complain about is a
 * conversion that did not work, however good it looked on the way through.
 */

const convert = async (
  source: Uint8Array,
  kind: Parameters<typeof imageConversionTarget>[0],
  fit: 'cover' | 'contain' | 'stretch' = 'cover',
) => {
  const converted = await convertImage(source, imageConversionTarget(kind), fit);
  if (!converted.ok) {
    throw new Error(`Expected the conversion to succeed: ${converted.error.message}`);
  }
  return converted.value.bytes;
};

const describeResult = (bytes: Uint8Array) => {
  const media = identifyMedia(bytes);
  if (media.kind !== 'image') {
    throw new Error(`Expected the result to be an image, but it is ${media.kind}.`);
  }
  return media;
};

describe('reading what was given', () => {
  it('converts a PNG', async () => {
    const result = describeResult(
      await convert(await pngBytes({ width: 1920, height: 1080 }), 'liveAreaBackground'),
    );

    expect([result.format, result.width, result.height]).toEqual(['png', 960, 512]);
  });

  it('converts a JPEG, which a theme cannot use as it stands', async () => {
    const result = describeResult(
      await convert(await jpegBytes({ width: 1600, height: 900 }), 'liveAreaBackground'),
    );

    expect(result.format).toBe('png');
  });

  it('converts a BMP', async () => {
    const result = describeResult(
      await convert(await bmpBytes({ width: 400, height: 400 }), 'appIcon'),
    );

    expect([result.format, result.width, result.height]).toEqual(['png', 128, 128]);
  });

  it('goes by what the bytes are, not by what a name claims', async () => {
    // A JPEG is a JPEG whatever the theme decides to call the file it ends up in.
    const jpeg = await jpegBytes({ width: 400, height: 400 });

    expect(identifyMedia(jpeg)).toMatchObject({ kind: 'image', format: 'jpeg' });
    expect(describeResult(await convert(jpeg, 'appIcon')).format).toBe('png');
  });

  it('refuses a file that is not an image', async () => {
    const converted = await convertImage(
      new TextEncoder().encode('this is a sentence, not a picture'),
      imageConversionTarget('appIcon'),
      'cover',
    );

    expect(converted.ok).toBe(false);
    expect(converted.ok || converted.error.code).toBe('not-an-image');
  });

  it('refuses an image whose header says it is too large to decode', async () => {
    const side = Math.ceil(Math.sqrt(MAX_SOURCE_PIXELS)) + 1000;
    const bomb = pngHeaderBytes({ width: side, height: side });

    const converted = await convertImage(bomb, imageConversionTarget('appIcon'), 'cover');

    expect(converted.ok || converted.error.code).toBe('too-large');
  });

  it('refuses an image with an absurd side, however few pixels it claims', async () => {
    const converted = await convertImage(
      pngHeaderBytes({ width: MAX_SOURCE_SIDE + 1, height: 4 }),
      imageConversionTarget('appIcon'),
      'cover',
    );

    expect(converted.ok || converted.error.code).toBe('too-large');
  });

  it('refuses a PNG header with no image behind it, without crashing', async () => {
    const converted = await convertImage(
      pngHeaderBytes({ width: 64, height: 64 }),
      imageConversionTarget('appIcon'),
      'cover',
    );

    expect(converted.ok).toBe(false);
    expect(converted.ok || converted.error.code).toBe('undecodable');
  });
});

describe('making a picture the right shape', () => {
  it.each([
    ['cover', 'cover'],
    ['contain', 'contain'],
    ['stretch', 'stretch'],
  ] as const)('produces exactly the required size with %s', async (_name, fit) => {
    const spec = imageAssetSpec('liveAreaBackground');
    const result = describeResult(
      await convert(await pngBytes({ width: 1920, height: 1080 }), 'liveAreaBackground', fit),
    );

    expect([result.width, result.height]).toEqual([spec.width, spec.height]);
  });

  it('produces the required size from an image that is too small as well', async () => {
    const result = describeResult(
      await convert(await pngBytes({ width: 100, height: 60 }), 'liveAreaBackground'),
    );

    expect([result.width, result.height]).toEqual([960, 512]);
  });

  it('pads rather than crops when asked to contain a picture of another shape', async () => {
    // A tall picture contained in a wide slot leaves bars; they are black, as the console
    // composites anything it is not given.
    const converted = await convert(
      await pngBytes({ width: 200, height: 1000 }),
      'liveAreaBackground',
      'contain',
    );
    const pixels = await pixelsOf(converted);

    expect(pixels.at(2, 256).slice(0, 3)).toEqual([0, 0, 0]);
    expect(pixels.at(480, 256).slice(0, 3)).not.toEqual([0, 0, 0]);
  });

  it('fills the whole slot when asked to cover', async () => {
    const converted = await convert(
      await pngBytes({ width: 200, height: 1000 }),
      'liveAreaBackground',
      'cover',
    );
    const pixels = await pixelsOf(converted);

    // Nothing was padded: the picture reaches the edges.
    expect(pixels.at(2, 256).slice(0, 3)).not.toEqual([0, 0, 0]);
  });

  it('keeps every asset kind to its own specification', async () => {
    const source = await pngBytes({ width: 800, height: 600, transparentDisc: true });

    for (const kind of [
      'appIcon',
      'pageIndicator',
      'notificationBadge',
      'packageThumbnail',
    ] as const) {
      const spec = imageAssetSpec(kind);
      const result = describeResult(await convert(source, kind));

      expect([kind, result.width, result.height]).toEqual([kind, spec.width, spec.height]);
    }
  });
});

describe('palette images, for the assets that are conventionally indexed', () => {
  it('writes an indexed, eight-bit PNG', async () => {
    const result = describeResult(
      await convert(await pngBytes({ width: 1920, height: 1080 }), 'liveAreaBackground'),
    );

    expect(result.encoding).toMatchObject({ colorModel: 'indexed', bitDepth: 8 });
  });

  it('reduces a picture with far more colours than a palette holds', async () => {
    const source = await pngBytes({ width: 1920, height: 1080 });
    expect(await distinctColorCount(source)).toBeGreaterThan(256);

    const converted = await convert(source, 'liveAreaBackground');

    expect(await distinctColorCount(converted)).toBeLessThanOrEqual(256);
  });

  it('lays transparency over black rather than keeping it', async () => {
    const converted = await convert(
      await pngBytes({ width: 960, height: 512, transparentDisc: true }),
      'liveAreaBackground',
    );
    const result = describeResult(converted);
    const pixels = await pixelsOf(converted);

    expect(result.encoding?.hasTransparency).toBe(false);
    expect(pixels.at(480, 256)[3]).toBe(255);
  });

  it('writes the same bytes for the same picture', async () => {
    const source = await pngBytes({ width: 1200, height: 800 });

    const [first, second] = await Promise.all([
      convert(source, 'liveAreaBackground'),
      convert(source, 'liveAreaBackground'),
    ]);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('produces a file this application reads back as a valid PNG', async () => {
    const converted = await convert(
      await pngBytes({ width: 640, height: 480 }),
      'startScreenBackground',
    );

    // Round-tripped through a decoder rather than only through our own reader.
    const pixels = await pixelsOf(converted);
    expect([pixels.width, pixels.height]).toEqual([960, 512]);
  });
});

describe('assets that are allowed to be transparent', () => {
  it('keeps the alpha channel', async () => {
    const converted = await convert(
      await pngBytes({ width: 512, height: 512, transparentDisc: true }),
      'appIcon',
    );
    const result = describeResult(converted);
    const pixels = await pixelsOf(converted);

    expect(result.encoding).toMatchObject({ colorModel: 'truecolor-alpha', bitDepth: 8 });
    expect(result.encoding?.hasTransparency).toBe(true);
    expect(pixels.at(64, 64)[3]).toBeLessThan(255);
  });

  it('does not reduce them to a palette, because nothing asks it to', async () => {
    const converted = await convert(await pngBytes({ width: 512, height: 512 }), 'appIcon');

    expect(describeResult(converted).encoding?.colorModel).toBe('truecolor-alpha');
  });
});
