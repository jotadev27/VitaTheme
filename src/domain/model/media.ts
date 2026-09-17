/**
 * What the application could determine about a file referenced by a theme.
 *
 * Deliberately shallow: these facts come from reading a container header, never from
 * decoding the pixel or sample data of an untrusted file. Everything the validator needs
 * is available without handing the file to a decoder.
 */

export type ImageContainerFormat = 'png' | 'jpeg' | 'bmp' | 'gif';

/** PNG colour types, the vocabulary the other formats are mapped onto. */
export type ImageColorModel =
  'grayscale' | 'grayscale-alpha' | 'truecolor' | 'truecolor-alpha' | 'indexed';

export interface ImageEncoding {
  /** Bits per sample, not per pixel: an 8-bit-per-channel RGBA image reports 8. */
  readonly bitDepth: number;
  readonly colorModel: ImageColorModel;
  /** An alpha channel or, for indexed images, a transparent palette entry. */
  readonly hasTransparency: boolean;
}

export interface ImageDescriptor {
  readonly kind: 'image';
  readonly format: ImageContainerFormat;
  readonly width: number;
  readonly height: number;
  /**
   * Null when the encoding was not determined. Only PNG is read in full, because it is the
   * only format a theme may use; every other format is rejected on `format` alone, so
   * reporting encoding details for it would be guesswork.
   */
  readonly encoding: ImageEncoding | null;
}

export type AudioContainerFormat = 'at9' | 'wav';

export interface AudioDescriptor {
  readonly kind: 'audio';
  readonly format: AudioContainerFormat;
  readonly sampleRate: number;
  readonly channelCount: number;
}

/** The file was read but its container was not recognised. */
/**
 * Picture formats this application can name but cannot use.
 *
 * A theme may only hold PNG, and the pictures VitaTheme converts are the ones its image
 * library can decode — which these are not. They are recognised anyway, and only so that
 * somebody who drops one is told what it is instead of being told it is unrecognisable:
 * "that is a WebP" is an answer they can act on, "that is not a file type I know" is not.
 */
export type UnsupportedImageContainer = 'webp' | 'avif' | 'heic';

export interface UnrecognizedDescriptor {
  readonly kind: 'unrecognized';
  /** Set when the file is a picture in a format nothing here can read. */
  readonly container?: UnsupportedImageContainer;
}

export type MediaDescriptor = ImageDescriptor | AudioDescriptor | UnrecognizedDescriptor;

export interface InspectedAsset {
  readonly byteSize: number;
  readonly media: MediaDescriptor;
}

export const isImage = (media: MediaDescriptor): media is ImageDescriptor => media.kind === 'image';

export const isAudio = (media: MediaDescriptor): media is AudioDescriptor => media.kind === 'audio';
