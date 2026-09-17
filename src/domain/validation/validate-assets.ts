import type { ImageDescriptor, MediaDescriptor } from '../model/media';
import { assetPathExtension, type ThemeAssetPath } from '../model/theme-asset-path';
import {
  collectAssetReferences,
  type ThemeAssetReference,
  type ThemeProject,
} from '../model/theme-project';
import {
  imageAssetSpec,
  MAX_IMAGE_BIT_DEPTH,
  RECOMMENDED_OPAQUE_COLOR_MODEL,
  REQUIRED_IMAGE_FORMAT,
  type ThemeImageAssetSpec,
} from '../vita/asset-specs';
import { REQUIRED_AUDIO_EXTENSION, REQUIRED_AUDIO_FORMAT } from '../vita/audio';
import {
  DISTRIBUTION_SIZE_WARNING_RATIO,
  MAX_DISTRIBUTION_ARCHIVE_BYTES,
} from '../vita/distribution';
import type { AssetCatalog } from './asset-catalog';
import {
  VALIDATION_CODES,
  validationError,
  validationWarning,
  type ValidationIssue,
} from './issue';

const REQUIRED_IMAGE_EXTENSION = `.${REQUIRED_IMAGE_FORMAT}`;

const describeMedia = (media: MediaDescriptor): string => {
  switch (media.kind) {
    case 'image':
      return `a ${media.format.toUpperCase()} image`;
    case 'audio':
      return `${media.format.toUpperCase()} audio`;
    case 'unrecognized':
      return media.container === undefined
        ? 'an unrecognised file type'
        : `a ${media.container.toUpperCase()} image`;
  }
};

/**
 * What to do about it, when there is something specific to say.
 *
 * A picture in a format this application cannot read is not a mistake anybody can see from
 * the message alone — it looks like a picture, and it is one. Saying which step is missing
 * turns the problem into a task.
 */
const adviceFor = (media: MediaDescriptor): string =>
  media.kind === 'unrecognized' && media.container !== undefined
    ? ` VitaTheme cannot convert ${media.container.toUpperCase()}; save it as a PNG or JPEG first.`
    : '';

const validateImageAsset = (
  reference: ThemeAssetReference,
  media: MediaDescriptor,
  spec: ThemeImageAssetSpec,
): ValidationIssue[] => {
  const { location, path } = reference;

  if (media.kind !== 'image' || media.format !== REQUIRED_IMAGE_FORMAT) {
    return [
      validationError(
        media.kind === 'unrecognized'
          ? VALIDATION_CODES.assetUnrecognizedFormat
          : VALIDATION_CODES.assetWrongImageFormat,
        location,
        `${spec.label} "${path}" must be a PNG image, but it is ${describeMedia(media)}.${adviceFor(media)}`,
        { expectedFormat: REQUIRED_IMAGE_FORMAT },
      ),
    ];
  }

  return [
    ...validateImageExtension(reference, media),
    ...validateImageDimensions(reference, media, spec),
    ...validateImageEncoding(reference, media, spec),
  ];
};

const validateImageExtension = (
  { location, path }: ThemeAssetReference,
  media: ImageDescriptor,
): ValidationIssue[] => {
  const extension = assetPathExtension(path);
  if (extension === REQUIRED_IMAGE_EXTENSION) {
    return [];
  }

  return [
    validationWarning(
      VALIDATION_CODES.assetExtensionMismatch,
      location,
      `"${path}" is a valid ${media.format.toUpperCase()} image but does not use the ` +
        `${REQUIRED_IMAGE_EXTENSION} extension. Rename it to avoid confusing other theme tools.`,
      { expectedExtension: REQUIRED_IMAGE_EXTENSION, actualExtension: extension },
    ),
  ];
};

const validateImageDimensions = (
  { location, path }: ThemeAssetReference,
  media: ImageDescriptor,
  spec: ThemeImageAssetSpec,
): ValidationIssue[] => {
  if (media.width === spec.width && media.height === spec.height) {
    return [];
  }

  const expected = `${String(spec.width)}x${String(spec.height)}`;
  const actual = `${String(media.width)}x${String(media.height)}`;
  const details = {
    expectedWidth: spec.width,
    expectedHeight: spec.height,
    actualWidth: media.width,
    actualHeight: media.height,
  };

  // Where the required size rests on a single unconfirmed source, a mismatch is reported but
  // never blocks export: the console may well accept sizes the community has not documented.
  return spec.dimensionsConfidence === 'verified'
    ? [
        validationError(
          VALIDATION_CODES.assetWrongDimensions,
          location,
          `${spec.label} "${path}" must be ${expected} pixels, but it is ${actual}.`,
          details,
        ),
      ]
    : [
        validationWarning(
          VALIDATION_CODES.assetWrongDimensions,
          location,
          `${spec.label} "${path}" is ${actual} pixels; themes normally use ${expected}. ` +
            'This size is documented by a single community source and is not confirmed.',
          details,
        ),
      ];
};

const validateImageEncoding = (
  { location, path }: ThemeAssetReference,
  media: ImageDescriptor,
  spec: ThemeImageAssetSpec,
): ValidationIssue[] => {
  const encoding = media.encoding;
  if (encoding === null) {
    return [];
  }

  const issues: ValidationIssue[] = [];

  if (encoding.bitDepth > MAX_IMAGE_BIT_DEPTH) {
    issues.push(
      validationWarning(
        VALIDATION_CODES.assetBitDepthTooHigh,
        location,
        `"${path}" uses ${String(encoding.bitDepth)} bits per channel. PS Vita themes are ` +
          `authored at ${String(MAX_IMAGE_BIT_DEPTH)} bits; a higher depth is not known to be ` +
          'supported and makes the theme larger.',
        { maxBitDepth: MAX_IMAGE_BIT_DEPTH, actualBitDepth: encoding.bitDepth },
      ),
    );
  }

  if (spec.transparency === 'unsupported' && encoding.hasTransparency) {
    issues.push(
      validationWarning(
        VALIDATION_CODES.assetUnexpectedTransparency,
        location,
        `${spec.label} "${path}" has transparency, which is not used for this asset. ` +
          'The console composites it over black, so the result may not look as intended.',
      ),
    );
  }

  if (
    spec.transparency === 'unsupported' &&
    encoding.colorModel !== RECOMMENDED_OPAQUE_COLOR_MODEL
  ) {
    issues.push(
      validationWarning(
        VALIDATION_CODES.assetNotIndexed,
        location,
        `${spec.label} "${path}" is not an indexed ("PNG-8") image. Indexed PNGs are the ` +
          'convention for opaque theme assets and keep the theme well under the sharing size limit.',
        { colorModel: encoding.colorModel },
      ),
    );
  }

  return issues;
};

const validateAudioAsset = (
  { location, path }: ThemeAssetReference,
  media: MediaDescriptor,
): ValidationIssue[] => {
  if (media.kind !== 'audio' || media.format !== REQUIRED_AUDIO_FORMAT) {
    return [
      validationError(
        VALIDATION_CODES.assetWrongAudioFormat,
        location,
        `Background music "${path}" must be an ATRAC9 (.at9) file, but it is ` +
          `${describeMedia(media)}. Convert the source audio to AT9 before adding it; renaming the file is not conversion.`,
        { expectedFormat: REQUIRED_AUDIO_FORMAT },
      ),
    ];
  }

  const extension = assetPathExtension(path);
  return extension === REQUIRED_AUDIO_EXTENSION
    ? []
    : [
        validationWarning(
          VALIDATION_CODES.assetExtensionMismatch,
          location,
          `Background music "${path}" is valid ATRAC9 audio but does not use the ` +
            `${REQUIRED_AUDIO_EXTENSION} extension.`,
          { expectedExtension: REQUIRED_AUDIO_EXTENSION, actualExtension: extension },
        ),
      ];
};

const validateTotalSize = (distinctAssetBytes: number): ValidationIssue[] => {
  const threshold = MAX_DISTRIBUTION_ARCHIVE_BYTES * DISTRIBUTION_SIZE_WARNING_RATIO;
  if (distinctAssetBytes <= threshold) {
    return [];
  }

  const megabytes = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

  return [
    validationWarning(
      VALIDATION_CODES.assetTotalSizeExceedsDistributionLimit,
      'theme',
      `The theme's assets total ${megabytes(distinctAssetBytes)} MB. Theme repositories ` +
        `reject archives above ${megabytes(MAX_DISTRIBUTION_ARCHIVE_BYTES)} MB, so the theme ` +
        'may not be shareable. Background music is usually the largest contributor.',
      { totalBytes: distinctAssetBytes, limitBytes: MAX_DISTRIBUTION_ARCHIVE_BYTES },
    ),
  ];
};

export const validateAssets = (
  project: ThemeProject,
  catalog: AssetCatalog,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  // Themes legitimately reuse one file across several pages; only count each file once.
  const countedBytes = new Map<ThemeAssetPath, number>();

  for (const reference of collectAssetReferences(project)) {
    const lookup = catalog.lookup(reference.path);

    if (lookup.status === 'missing') {
      issues.push(
        validationError(
          VALIDATION_CODES.assetMissing,
          reference.location,
          `The theme references "${reference.path}", but that file is not in the theme folder.`,
        ),
      );
      continue;
    }

    if (lookup.status === 'unreadable') {
      issues.push(
        validationError(
          VALIDATION_CODES.assetUnreadable,
          reference.location,
          `"${reference.path}" could not be read: ${lookup.reason}`,
        ),
      );
      continue;
    }

    countedBytes.set(reference.path, lookup.asset.byteSize);

    issues.push(
      ...(reference.usage === 'backgroundMusic'
        ? validateAudioAsset(reference, lookup.asset.media)
        : validateImageAsset(reference, lookup.asset.media, imageAssetSpec(reference.usage))),
    );
  }

  const totalBytes = [...countedBytes.values()].reduce((sum, bytes) => sum + bytes, 0);
  issues.push(...validateTotalSize(totalBytes));

  return issues;
};
