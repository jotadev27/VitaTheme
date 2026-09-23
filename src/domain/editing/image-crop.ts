/** Placement of a source image inside an asset's exact target rectangle. */
export interface ImageCrop {
  /** One is the smallest scale that fills the rectangle. */
  readonly zoom: number;
  /** Image displacement from the centred position, as a fraction of available travel. */
  readonly x: number;
  readonly y: number;
  /** Optional mask for square assets that support transparency. */
  readonly shape?: 'square' | 'circle';
}

export const RESET_IMAGE_CROP: ImageCrop = { zoom: 1, x: 0, y: 0 };
export const MAX_IMAGE_ZOOM = 4;

export const clampImageCrop = (crop: ImageCrop): ImageCrop => ({
  zoom: Math.min(MAX_IMAGE_ZOOM, Math.max(1, crop.zoom)),
  x: Math.min(1, Math.max(-1, crop.x)),
  y: Math.min(1, Math.max(-1, crop.y)),
});

export const imageCropPlacement = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  requested: ImageCrop,
): { width: number; height: number; left: number; top: number } => {
  const crop = clampImageCrop(requested);
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) * crop.zoom;
  const width = Math.max(targetWidth, Math.ceil(sourceWidth * scale));
  const height = Math.max(targetHeight, Math.ceil(sourceHeight * scale));
  return {
    width,
    height,
    left: -((width - targetWidth) / 2) * (1 - crop.x),
    top: -((height - targetHeight) / 2) * (1 - crop.y),
  };
};

/** A pointer movement in viewport pixels, converted to the same placement used for export. */
export const dragImageCrop = (
  crop: ImageCrop,
  movementX: number,
  movementY: number,
  viewportWidth: number,
  viewportHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): ImageCrop => {
  const placement = imageCropPlacement(sourceWidth, sourceHeight, targetWidth, targetHeight, crop);
  const travelX = placement.width - targetWidth;
  const travelY = placement.height - targetHeight;
  return clampImageCrop({
    ...crop,
    x: travelX === 0 ? 0 : crop.x + (2 * movementX * targetWidth) / (viewportWidth * travelX),
    y: travelY === 0 ? 0 : crop.y + (2 * movementY * targetHeight) / (viewportHeight * travelY),
  });
};
