import { Jimp } from 'jimp';

/**
 * Pictures to convert, built rather than committed.
 *
 * Every fixture is generated from a formula, so the repository carries no binary artwork and
 * nothing anybody else made. They are deliberately awkward: the wrong shape, more colours
 * than a palette holds, transparency where a theme asset has none.
 */

export interface TestImageOptions {
  readonly width: number;
  readonly height: number;
  /** A translucent disc in the middle, for watching what happens to transparency. */
  readonly transparentDisc?: boolean;
  /** Smooth gradients produce far more colours than a palette can hold. */
  readonly gradient?: boolean;
}

const testImage = ({
  width,
  height,
  transparentDisc = false,
  gradient = true,
}: TestImageOptions) => {
  const image = new Jimp({ width, height, color: 0x000000ff });
  const pixels = image.bitmap.data;
  const radius = Math.min(width, height) / 4;

  // Written straight into the bitmap: a fixture is not the place to spend a second a call.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const inside = Math.hypot(x - width / 2, y - height / 2) < radius;

      pixels[at] = gradient ? Math.round((x / width) * 255) : x < width / 2 ? 255 : 0;
      pixels[at + 1] = gradient ? Math.round((y / height) * 255) : y < height / 2 ? 255 : 0;
      pixels[at + 2] = gradient ? Math.round((Math.sin(x / 17) * 0.5 + 0.5) * 255) : 64;
      pixels[at + 3] = transparentDisc && inside ? 0x40 : 0xff;
    }
  }

  return image;
};

export const pngBytes = async (options: TestImageOptions): Promise<Uint8Array> =>
  new Uint8Array(await testImage(options).getBuffer('image/png'));

export const jpegBytes = async (options: TestImageOptions): Promise<Uint8Array> =>
  new Uint8Array(await testImage(options).getBuffer('image/jpeg', { quality: 90 }));

export const bmpBytes = async (options: TestImageOptions): Promise<Uint8Array> =>
  new Uint8Array(await testImage(options).getBuffer('image/bmp'));

/** The pixels of an encoded image, for checking what a conversion actually produced. */
export const pixelsOf = async (
  bytes: Uint8Array,
): Promise<{ width: number; height: number; at: (x: number, y: number) => readonly number[] }> => {
  const image = await Jimp.fromBuffer(Buffer.from(bytes));
  const { data, width, height } = image.bitmap;

  return {
    width,
    height,
    at: (x, y) => {
      const offset = (y * width + x) * 4;
      return [
        data[offset] ?? 0,
        data[offset + 1] ?? 0,
        data[offset + 2] ?? 0,
        data[offset + 3] ?? 0,
      ];
    },
  };
};

export const distinctColorCount = async (bytes: Uint8Array): Promise<number> => {
  const image = await Jimp.fromBuffer(Buffer.from(bytes));
  const seen = new Set<number>();

  for (let at = 0; at < image.bitmap.data.length; at += 4) {
    seen.add(image.bitmap.data.readUInt32BE(at));
  }

  return seen.size;
};
