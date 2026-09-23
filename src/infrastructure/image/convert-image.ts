import type { ConvertedImage, ImageConversionError } from '../../application/ports/image-converter';
import type { ImageConversionTarget, ImageFit } from '../../domain/editing/image-conversion';
import type { ImageCrop } from '../../domain/editing/image-crop';
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
  crop?: ImageCrop,
): Promise<Result<ConvertedImage, ImageConversionError>> => {
  const fitted = await decodeAndFit(source, target.width, target.height, fit, crop);
  if (!fitted.ok) return failure(fitted.error);

  if (crop?.shape === 'circle') {
    if (!target.allowsCircle) {
      return failure({
        code: 'failed',
        message: 'A circular crop is only available for page indicators.',
      });
    }
    const { width, height, pixels } = fitted.value;
    const radius = width / 2;
    // Coverage at the edge keeps the circle smooth without adding dark border pixels.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let inside = 0;
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            const dx = x + (sx + 0.5) / 4 - radius;
            const dy = y + (sy + 0.5) / 4 - radius;
            if (dx * dx + dy * dy <= radius * radius) inside++;
          }
        }
        const alpha = (y * width + x) * 4 + 3;
        pixels[alpha] = Math.round(((pixels[alpha] ?? 0) * inside) / 16);
      }
    }
  }

  return encodeForTarget(fitted.value, target);
};
