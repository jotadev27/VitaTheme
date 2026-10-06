/**
 * Background music is the only audio a theme carries. The PS Vita plays Sony's ATRAC9
 * codec, distributed inside a RIFF/WAVE container with the `.at9` extension.
 *
 * This build has no bundled ATRAC9 encoder. It accepts already-encoded audio and checks
 * the container without executing files or loading an external conversion tool.
 */
export const REQUIRED_AUDIO_FORMAT = 'at9';
export const REQUIRED_AUDIO_EXTENSION = '.at9';
