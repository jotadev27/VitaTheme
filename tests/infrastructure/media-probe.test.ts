import { describe, expect, it } from 'vitest';
import { identifyMedia } from '@/infrastructure/media/media-probe';
import {
  bmpHeaderBytes,
  gifHeaderBytes,
  isoBaseMediaHeaderBytes,
  jpegHeaderBytes,
  pngHeaderBytes,
  riffWaveBytes,
  webpHeaderBytes,
  type PngColorType,
} from '../support/binary-fixtures';

describe('identifyMedia', () => {
  describe('PNG', () => {
    it('reads the dimensions a theme wallpaper is checked against', () => {
      expect(identifyMedia(pngHeaderBytes({ width: 960, height: 512 }))).toMatchObject({
        kind: 'image',
        format: 'png',
        width: 960,
        height: 512,
      });
    });

    it.each<[PngColorType, string]>([
      [0, 'grayscale'],
      [2, 'truecolor'],
      [3, 'indexed'],
      [4, 'grayscale-alpha'],
      [6, 'truecolor-alpha'],
    ])('maps colour type %d to %s', (colorType, colorModel) => {
      const media = identifyMedia(pngHeaderBytes({ width: 8, height: 8, colorType }));

      expect(media).toMatchObject({ kind: 'image', encoding: { colorModel } });
    });

    it.each([1, 2, 4, 8, 16])('reports a bit depth of %d', (bitDepth) => {
      const media = identifyMedia(pngHeaderBytes({ width: 8, height: 8, bitDepth, colorType: 0 }));

      expect(media).toMatchObject({ kind: 'image', encoding: { bitDepth } });
    });

    it('treats an alpha channel as transparency', () => {
      const media = identifyMedia(pngHeaderBytes({ width: 8, height: 8, colorType: 6 }));

      expect(media).toMatchObject({ kind: 'image', encoding: { hasTransparency: true } });
    });

    it('finds transparency declared by a palette chunk on an indexed image', () => {
      const media = identifyMedia(
        pngHeaderBytes({ width: 8, height: 8, colorType: 3, withTransparencyChunk: true }),
      );

      expect(media).toMatchObject({
        kind: 'image',
        encoding: { colorModel: 'indexed', hasTransparency: true },
      });
    });

    it('reports an opaque indexed image as having no transparency', () => {
      const media = identifyMedia(pngHeaderBytes({ width: 8, height: 8, colorType: 3 }));

      expect(media).toMatchObject({ kind: 'image', encoding: { hasTransparency: false } });
    });

    it('rejects a colour type the format does not define', () => {
      const bytes = pngHeaderBytes({ width: 8, height: 8 });
      bytes[25] = 7;

      expect(identifyMedia(bytes)).toMatchObject({ kind: 'image', encoding: null });
    });
  });

  describe('other image formats', () => {
    it('identifies a JPEG and its dimensions', () => {
      expect(identifyMedia(jpegHeaderBytes(640, 480))).toEqual({
        kind: 'image',
        format: 'jpeg',
        width: 640,
        height: 480,
        encoding: null,
      });
    });

    it('identifies a GIF and its dimensions', () => {
      expect(identifyMedia(gifHeaderBytes(320, 240))).toMatchObject({
        kind: 'image',
        format: 'gif',
        width: 320,
        height: 240,
      });
    });

    it('identifies a BMP and its dimensions', () => {
      expect(identifyMedia(bmpHeaderBytes(100, 50))).toMatchObject({
        kind: 'image',
        format: 'bmp',
        width: 100,
        height: 50,
      });
    });

    it('reads a top-down BMP, whose height is stored negative', () => {
      expect(identifyMedia(bmpHeaderBytes(100, -50))).toMatchObject({ height: 50 });
    });
  });

  describe('audio', () => {
    it('recognises ATRAC9 by its sub-format identifier', () => {
      expect(identifyMedia(riffWaveBytes({ atrac9: true }))).toEqual({
        kind: 'audio',
        format: 'at9',
        sampleRate: 48000,
        channelCount: 2,
      });
    });

    it('distinguishes uncompressed audio from ATRAC9', () => {
      expect(identifyMedia(riffWaveBytes({ atrac9: false, sampleRate: 44100 }))).toEqual({
        kind: 'audio',
        format: 'wav',
        sampleRate: 44100,
        channelCount: 2,
      });
    });

    it('walks past an odd-sized chunk, which RIFF pads to an even boundary', () => {
      const media = identifyMedia(riffWaveBytes({ atrac9: true, withOddSizedLeadingChunk: true }));

      expect(media).toMatchObject({ kind: 'audio', format: 'at9' });
    });
  });

  describe('unrecognised input', () => {
    it.each([
      ['an empty file', new Uint8Array()],
      ['plain text', new TextEncoder().encode('<?xml version="1.0"?><theme/>')],
      ['a truncated PNG signature', Uint8Array.from([0x89, 0x50, 0x4e])],
      // Not WEBP either, which is now named in its own right further down.
      [
        'a RIFF container that is neither WAVE nor a picture',
        new TextEncoder().encode('RIFF....AVI LIST'),
      ],
    ])('reports %s as unrecognised', (_label, bytes) => {
      expect(identifyMedia(bytes)).toEqual({ kind: 'unrecognized' });
    });

    it('does not mistake a PNG signature with a corrupt header block for an image', () => {
      const bytes = pngHeaderBytes({ width: 8, height: 8 });
      bytes.set(new TextEncoder().encode('XXXX'), 12);

      expect(identifyMedia(bytes)).toEqual({ kind: 'unrecognized' });
    });
  });
});

describe('pictures in formats nothing here can read', () => {
  it('names a WebP rather than calling it a mystery', () => {
    expect(identifyMedia(webpHeaderBytes())).toEqual({
      kind: 'unrecognized',
      container: 'webp',
    });
  });

  it.each([
    ['avif', 'avif'],
    ['avis', 'avif'],
    ['heic', 'heic'],
    ['mif1', 'heic'],
  ])('names a %s file as %s', (brand, container) => {
    expect(identifyMedia(isoBaseMediaHeaderBytes(brand))).toEqual({
      kind: 'unrecognized',
      container,
    });
  });

  it('still says nothing about a file it has no name for', () => {
    expect(identifyMedia(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({
      kind: 'unrecognized',
    });
  });

  it('does not mistake other ISO base media files for pictures', () => {
    // An MP4 video is the same container with a different brand, and is not a picture.
    expect(identifyMedia(isoBaseMediaHeaderBytes('isom'))).toEqual({ kind: 'unrecognized' });
  });
});
