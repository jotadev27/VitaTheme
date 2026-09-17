import type { MediaDescriptor } from '../../domain/model/media';
import { readAudioHeader } from './audio-header-reader';
import { readImageHeader, readUnsupportedImageContainer } from './image-header-reader';

/**
 * Bytes to read from the start of a file when identifying it.
 *
 * Every header this module understands sits well inside the first few kilobytes. Capping
 * the read keeps the cost of validating a theme proportional to the number of files rather
 * than to their size, and means a hostile file cannot be used to exhaust memory.
 */
export const MEDIA_HEADER_BYTES = 64 * 1024;

export const identifyMedia = (header: Uint8Array): MediaDescriptor => {
  const known = readImageHeader(header) ?? readAudioHeader(header);
  if (known !== null) {
    return known;
  }

  // Not usable either way, but a picture in a format nothing here reads is worth naming: it
  // is the difference between "export this as a PNG first" and "this file is a mystery".
  const container = readUnsupportedImageContainer(header);
  return container === null ? { kind: 'unrecognized' } : { kind: 'unrecognized', container };
};
