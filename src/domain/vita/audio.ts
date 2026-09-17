/**
 * Background music is the only audio a theme carries. The PS Vita plays Sony's ATRAC9
 * codec, distributed inside a RIFF/WAVE container with the `.at9` extension.
 *
 * Encoding to ATRAC9 requires Sony's `at9tool`, which cannot be redistributed, so the
 * application accepts an already-encoded file and verifies the container instead.
 */
export const REQUIRED_AUDIO_FORMAT = 'at9';
export const REQUIRED_AUDIO_EXTENSION = '.at9';
