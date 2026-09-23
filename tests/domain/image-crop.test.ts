import { describe, expect, it } from 'vitest';
import {
  clampImageCrop,
  dragImageCrop,
  imageCropPlacement,
  RESET_IMAGE_CROP,
} from '@/domain/editing/image-crop';

describe('image crop placement', () => {
  it('fills the target without bars and centres the default crop', () => {
    expect(imageCropPlacement(400, 200, 100, 100, RESET_IMAGE_CROP)).toEqual({
      width: 200,
      height: 100,
      left: -50,
      top: -0,
    });
  });

  it('moves to either edge and clamps pointer travel', () => {
    const start = RESET_IMAGE_CROP;
    const moved = dragImageCrop(start, 25, 0, 100, 100, 400, 200, 100, 100);
    expect(moved.x).toBe(0.5);
    expect(imageCropPlacement(400, 200, 100, 100, moved).left).toBe(-25);
    const edge = dragImageCrop(moved, 1000, -1000, 100, 100, 400, 200, 100, 100);
    expect(edge).toMatchObject({ x: 1, y: 0 });
  });

  it('zooms around the crop centre and bounds every control', () => {
    const zoomed = imageCropPlacement(400, 200, 100, 100, { zoom: 2, x: 0, y: 0 });
    expect(zoomed).toEqual({ width: 400, height: 200, left: -150, top: -50 });
    expect(clampImageCrop({ zoom: 99, x: -5, y: 5 })).toEqual({ zoom: 4, x: -1, y: 1 });
  });
});
