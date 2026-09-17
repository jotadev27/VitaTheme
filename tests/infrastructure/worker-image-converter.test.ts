import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { imageConversionTarget } from '@/domain/editing/image-conversion';
import { workerImageConverter } from '@/infrastructure/image/worker-image-converter';
import { identifyMedia } from '@/infrastructure/media/media-probe';
import { pngBytes } from '../support/image-fixtures';

/**
 * Converting somewhere the application is not waiting.
 *
 * The worker is a built file rather than a module this test can import, because that is what
 * it is at runtime: a second bundle beside the process that starts it. So the build has to
 * have run — which is also what makes this the test that catches a worker the build stopped
 * producing.
 */

const workerPath = fileURLToPath(new URL('../../out/main/image-worker.js', import.meta.url));

let converter: ReturnType<typeof workerImageConverter>;

beforeAll(() => {
  if (!existsSync(workerPath)) {
    // Built once, not per test: the worker is part of the application, not of this file.
    execFileSync('npx', ['electron-vite', 'build'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      stdio: 'ignore',
    });
  }

  converter = workerImageConverter({ workerPath });
}, 300_000);

afterAll(async () => {
  await converter.stop();
});

describe('a conversion that happens elsewhere', () => {
  it('produces what the slot needs, the same as converting here would', async () => {
    const source = await pngBytes({ width: 1200, height: 900 });

    const converted = await converter.convert(
      source,
      imageConversionTarget('liveAreaBackground'),
      'cover',
    );

    expect(converted.ok).toBe(true);
    expect(converted.ok && identifyMedia(converted.value.bytes)).toMatchObject({
      format: 'png',
      width: 960,
      height: 512,
      encoding: { colorModel: 'indexed', bitDepth: 8 },
    });
    expect(converted.ok && converted.value.inspected.byteSize).toBe(
      converted.ok ? converted.value.bytes.byteLength : 0,
    );
  }, 120_000);

  it('carries a refusal back with the reason it was refused', async () => {
    const converted = await converter.convert(
      new TextEncoder().encode('not a picture'),
      imageConversionTarget('appIcon'),
      'cover',
    );

    expect(converted.ok).toBe(false);
    expect(converted.ok || converted.error.code).toBe('not-an-image');
  }, 120_000);

  it('answers several conversions asked for at once', async () => {
    const source = await pngBytes({ width: 400, height: 400 });

    const results = await Promise.all([
      converter.convert(source, imageConversionTarget('appIcon'), 'cover'),
      converter.convert(source, imageConversionTarget('pageIndicator'), 'contain'),
      converter.convert(source, imageConversionTarget('notificationBadge'), 'stretch'),
    ]);

    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
    expect(
      results
        .map((result) => (result.ok ? result.value.inspected.media : null))
        .map((media) =>
          media?.kind === 'image' ? `${String(media.width)}x${String(media.height)}` : 'none',
        ),
    ).toEqual(['128x128', '22x22', '120x110']);
  }, 120_000);

  it('fails the conversion rather than the application when there is no worker to run it', async () => {
    const missing = workerImageConverter({ workerPath: `${workerPath}.not-here` });

    const converted = await missing.convert(
      await pngBytes({ width: 100, height: 100 }),
      imageConversionTarget('appIcon'),
      'cover',
    );

    expect(converted.ok).toBe(false);
    expect(converted.ok || converted.error.code).toBe('failed');
    await missing.stop();
  }, 120_000);
});
