/**
 * A single problem found in a theme.
 *
 * Issues are data, not exceptions: a theme can have many independent problems and the
 * author needs to see all of them at once. `code` is stable and machine-readable so the
 * user interface can group, filter and link issues without matching on message text;
 * `message` is written for the theme author, never for a developer.
 */
export type ValidationSeverity =
  /** The theme will not work on the console, or cannot be exported safely. */
  | 'error'
  /** The theme will load, but something is likely unintended or is unverified. */
  | 'warning';

export const VALIDATION_CODES = {
  assetMissing: 'asset.missing',
  assetUnreadable: 'asset.unreadable',
  assetUnrecognizedFormat: 'asset.unrecognized-format',
  assetWrongImageFormat: 'asset.wrong-image-format',
  assetWrongAudioFormat: 'asset.wrong-audio-format',
  assetExtensionMismatch: 'asset.extension-mismatch',
  assetWrongDimensions: 'asset.wrong-dimensions',
  assetBitDepthTooHigh: 'asset.bit-depth-too-high',
  assetUnexpectedTransparency: 'asset.unexpected-transparency',
  assetNotIndexed: 'asset.not-indexed',
  assetTotalSizeExceedsDistributionLimit: 'asset.total-size-exceeds-distribution-limit',

  manifestInvalidColor: 'manifest.invalid-color',
  manifestInvalidContentVersion: 'manifest.invalid-content-version',
  manifestInvalidNumber: 'manifest.invalid-number',
  manifestInvalidBoolean: 'manifest.invalid-boolean',
  manifestUnsafeAssetPath: 'manifest.unsafe-asset-path',
  manifestUnexpectedFormatVersion: 'manifest.unexpected-format-version',

  metadataTitleEmpty: 'metadata.title-empty',
  metadataProviderEmpty: 'metadata.provider-empty',
  metadataTranslationEmpty: 'metadata.translation-empty',
  metadataUnknownLanguageCode: 'metadata.unknown-language-code',
  metadataPreviewMissing: 'metadata.preview-missing',

  homeNoPages: 'home.no-pages',
  homeTooManyPages: 'home.too-many-pages',
  homePageBackgroundMissing: 'home.page-background-missing',
  homePageThumbnailMissing: 'home.page-thumbnail-missing',
  homePageIndicatorIncomplete: 'home.page-indicator-incomplete',
  homeIconSetIncomplete: 'home.icon-set-incomplete',

  informationBarBadgeIncomplete: 'information-bar.badge-incomplete',

  startScreenBackgroundMissing: 'start-screen.background-missing',
  startScreenUnknownDateLayout: 'start-screen.unknown-date-layout',
} as const;

export type ValidationCode = (typeof VALIDATION_CODES)[keyof typeof VALIDATION_CODES];

export type ValidationDetails = Readonly<Record<string, string | number | boolean>>;

export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: ValidationCode;
  /** Dotted path to the offending field inside the project, e.g. `home.pages[0].background`. */
  readonly location: string;
  readonly message: string;
  readonly details?: ValidationDetails;
}

const issue = (
  severity: ValidationSeverity,
  code: ValidationCode,
  location: string,
  message: string,
  details?: ValidationDetails,
): ValidationIssue =>
  details === undefined
    ? { severity, code, location, message }
    : { severity, code, location, message, details };

export const validationError = (
  code: ValidationCode,
  location: string,
  message: string,
  details?: ValidationDetails,
): ValidationIssue => issue('error', code, location, message, details);

export const validationWarning = (
  code: ValidationCode,
  location: string,
  message: string,
  details?: ValidationDetails,
): ValidationIssue => issue('warning', code, location, message, details);
