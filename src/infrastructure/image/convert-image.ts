import type { ConvertedImage, ImageConversionError } from '../../application/ports/image-converter';
import type { ImageConversionTarget, ImageFit } from '../../domain/editing/image-conversion';
import { failure, type Result } from '../../domain/shared/result';
import { decodeAndFit, encodeForTarget } from './jimp-pipeline';

/**
 * Turning one picture into the picture a slot needs.
 *
 * The whole of the work is: read it, make it the right shape, and write it the way the slot
 * is conventionally written. What "the right shape" and "conventionally written" mean comes
 * from the domain's specification for the slot, never from here.
 *
 * Everything reaching here is untrusted, and is checked before a decoder is handed it — see
 * `jimp-pipeline`, which this shares with drawing a preview.
 */
export const convertImage = async (
  source: Uint8Array,
  target: ImageConversionTarget,
  fit: ImageFit,
): Promise<Result<ConvertedImage, ImageConversionError>> => {
  const fitted = await decodeAndFit(source, target.width, target.height, fit);

  return fitted.ok ? encodeForTarget(fitted.value, target) : failure(fitted.error);
};
