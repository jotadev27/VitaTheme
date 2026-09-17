import { Worker } from 'node:worker_threads';
import type {
  ConvertedImage,
  ImageConversionError,
  ImageConversionErrorCode,
  ImageConverter,
} from '../../application/ports/image-converter';
import { failure, success, type Result } from '../../domain/shared/result';
import type { ImageWorkerRequest, ImageWorkerResponse } from './image-worker';

/**
 * Image work, run somewhere the application is not waiting.
 *
 * The worker is started on the first conversion and kept: starting one costs more than a
 * small conversion does, and somebody converting one asset usually converts several. It is
 * kept alive by the process that owns it and stopped when the application stops.
 *
 * Nothing is trusted from either direction. A worker that dies mid-conversion — which is what
 * running out of memory over a hostile image looks like — fails that conversion and is
 * replaced for the next one, rather than taking the application with it.
 */

export interface WorkerImageConverterOptions {
  /** Where the worker's own bundle is. Supplied by the process that knows where it put it. */
  readonly workerPath: string;
}

const CONVERSION_ERROR_CODES: readonly ImageConversionErrorCode[] = [
  'not-an-image',
  'undecodable',
  'too-large',
  'failed',
];

const asErrorCode = (code: string): ImageConversionErrorCode =>
  CONVERSION_ERROR_CODES.find((known) => known === code) ?? 'failed';

const lost = (): Result<never, ImageConversionError> =>
  failure({
    code: 'failed',
    message:
      'The image could not be produced: the work stopped unexpectedly. The image may be ' +
      'larger or more complex than this application can handle.',
  });

export const workerImageConverter = ({
  workerPath,
}: WorkerImageConverterOptions): ImageConverter & { stop: () => Promise<void> } => {
  let worker: Worker | null = null;
  let nextRequestId = 1;
  /** Conversions waiting for an answer, so a worker that dies can fail all of them. */
  const waiting = new Map<number, (result: Result<ConvertedImage, ImageConversionError>) => void>();

  const settleAll = (result: Result<ConvertedImage, ImageConversionError>): void => {
    const pending = [...waiting.values()];
    waiting.clear();
    for (const settle of pending) {
      settle(result);
    }
  };

  const discard = (): void => {
    const dying = worker;
    worker = null;
    void dying?.terminate();
  };

  const running = (): Worker => {
    if (worker !== null) {
      return worker;
    }

    const started = new Worker(workerPath);
    started.on('message', (response: ImageWorkerResponse) => {
      const settle = waiting.get(response.id);
      waiting.delete(response.id);
      settle?.(
        response.ok
          ? success({ bytes: new Uint8Array(response.bytes), inspected: response.inspected })
          : failure({ code: asErrorCode(response.code), message: response.message }),
      );
    });

    // A worker that fails or exits takes every conversion waiting on it with it, and is not
    // reused: the next conversion starts a fresh one.
    started.on('error', () => {
      discard();
      settleAll(lost());
    });
    started.on('exit', () => {
      if (worker === started) {
        worker = null;
      }
      settleAll(lost());
    });

    // Nothing else in the application is waiting on this worker, so it must not be what keeps
    // the process alive.
    started.unref();
    worker = started;
    return started;
  };

  /** Both operations are the same exchange; only what is asked for differs. */
  const ask = (
    request: (id: number) => ImageWorkerRequest,
  ): Promise<Result<ConvertedImage, ImageConversionError>> =>
    new Promise((resolve) => {
      const id = nextRequestId++;
      waiting.set(id, resolve);

      try {
        running().postMessage(request(id));
      } catch {
        waiting.delete(id);
        discard();
        resolve(lost());
      }
    });

  return {
    convert: (source, target, fit) => ask((id) => ({ kind: 'convert', id, source, target, fit })),

    compose: (composition, target) => ask((id) => ({ kind: 'compose', id, composition, target })),

    stop: async () => {
      const dying = worker;
      worker = null;
      settleAll(lost());
      await dying?.terminate();
    },
  };
};
