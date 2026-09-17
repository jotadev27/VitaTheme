import { parentPort } from 'node:worker_threads';
import type { ImageConversionTarget, ImageFit } from '../../domain/editing/image-conversion';
import type { RasterComposition } from '../../domain/editing/preview-composition';
import type { InspectedAsset } from '../../domain/model/media';
import { composeImage } from './compose-image';
import { convertImage } from './convert-image';

/**
 * Where the arithmetic happens.
 *
 * Reducing a full-screen wallpaper to a palette takes about a second of unbroken work, and
 * drawing a preview takes as long again. Run in the process that owns the windows, menus and
 * dialogs, that is time in which the application answers nothing; run here, it is time in
 * which the interface says what it is doing and everything else carries on.
 *
 * The worker holds no state and decides nothing: one message in, one message out. It is also
 * where an image built to be expensive to decode does its damage — a worker that runs out of
 * memory takes only itself down, and the application reports a failure.
 */

export type ImageWorkerRequest =
  | {
      readonly kind: 'convert';
      readonly id: number;
      readonly source: Uint8Array;
      readonly target: ImageConversionTarget;
      readonly fit: ImageFit;
    }
  | {
      readonly kind: 'compose';
      readonly id: number;
      readonly composition: RasterComposition;
      readonly target: ImageConversionTarget;
    };

export type ImageWorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly inspected: InspectedAsset;
    }
  | { readonly id: number; readonly ok: false; readonly code: string; readonly message: string };

const port = parentPort;

if (port !== null) {
  port.on('message', (request: ImageWorkerRequest) => {
    const work =
      request.kind === 'convert'
        ? convertImage(request.source, request.target, request.fit)
        : composeImage(request.composition, request.target);

    void work.then(
      (produced) => {
        port.postMessage(
          produced.ok
            ? ({
                id: request.id,
                ok: true,
                bytes: produced.value.bytes,
                inspected: produced.value.inspected,
              } satisfies ImageWorkerResponse)
            : ({
                id: request.id,
                ok: false,
                code: produced.error.code,
                message: produced.error.message,
              } satisfies ImageWorkerResponse),
        );
      },
      (error: unknown) => {
        port.postMessage({
          id: request.id,
          ok: false,
          code: 'failed',
          message: `The image could not be processed: ${
            error instanceof Error ? error.message : 'the work stopped unexpectedly'
          }.`,
        } satisfies ImageWorkerResponse);
      },
    );
  });
}
