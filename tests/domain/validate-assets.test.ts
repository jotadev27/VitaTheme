import { describe, expect, it } from 'vitest';
import type { ImageDescriptor, MediaDescriptor } from '@/domain/model/media';
import { VALIDATION_CODES } from '@/domain/validation/issue';
import { errorsIn, isExportable, validationReport } from '@/domain/validation/report';
import { validateAssets } from '@/domain/validation/validate-assets';
import { MAX_DISTRIBUTION_ARCHIVE_BYTES } from '@/domain/vita/distribution';
import {
  aCatalog,
  aHomeScreen,
  aLiveAreaPage,
  aThemeMetadata,
  anAssetlessThemeProject,
  anInformationBar,
  assetPath,
  codesIn,
  foundAsset,
} from '../support/theme-fixtures';

type Encoding = NonNullable<ImageDescriptor['encoding']>;

const png = (width: number, height: number, encoding: Partial<Encoding> = {}): MediaDescriptor => ({
  kind: 'image',
  format: 'png',
  width,
  height,
  encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: false, ...encoding },
});

const atrac9: MediaDescriptor = {
  kind: 'audio',
  format: 'at9',
  sampleRate: 48000,
  channelCount: 2,
};

/** A project whose only asset is one LiveArea background, so a rule can be isolated. */
const withBackground = (path = 'bg1.png') =>
  anAssetlessThemeProject({
    home: aHomeScreen({
      pages: [aLiveAreaPage({ background: assetPath(path), thumbnail: null })],
      basePageIndicator: null,
      currentPageIndicator: null,
    }),
  });

describe('validateAssets', () => {
  it('reports nothing for a background that matches the specification', () => {
    expect(
      validateAssets(withBackground(), aCatalog({ 'bg1.png': foundAsset(png(960, 512)) })),
    ).toEqual([]);
  });

  it('reports a referenced file that is not in the theme folder', () => {
    const issues = validateAssets(withBackground(), aCatalog({}));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'error',
      code: VALIDATION_CODES.assetMissing,
      location: 'home.pages[0].background',
    });
    expect(issues[0]?.message).toContain('bg1.png');
  });

  it('reports a file that exists but could not be read', () => {
    const issues = validateAssets(
      withBackground(),
      aCatalog({ 'bg1.png': { status: 'unreadable', reason: 'permission denied' } }),
    );

    expect(issues[0]).toMatchObject({
      severity: 'error',
      code: VALIDATION_CODES.assetUnreadable,
    });
    expect(issues[0]?.message).toContain('permission denied');
  });

  describe('image format', () => {
    it('rejects an image that is not a PNG', () => {
      const issues = validateAssets(
        withBackground(),
        aCatalog({
          'bg1.png': foundAsset({
            kind: 'image',
            format: 'jpeg',
            width: 960,
            height: 512,
            encoding: null,
          }),
        }),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: VALIDATION_CODES.assetWrongImageFormat,
      });
      expect(issues[0]?.message).toContain('JPEG');
    });

    it('rejects a file whose container was not recognised at all', () => {
      const issues = validateAssets(
        withBackground(),
        aCatalog({ 'bg1.png': foundAsset({ kind: 'unrecognized' }) }),
      );

      expect(codesIn(validationReport(issues))).toEqual([VALIDATION_CODES.assetUnrecognizedFormat]);
    });

    it('warns when a valid PNG does not use the .png extension', () => {
      const issues = validateAssets(
        withBackground('bg1.jpg'),
        aCatalog({ 'bg1.jpg': foundAsset(png(960, 512)) }),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'warning',
        code: VALIDATION_CODES.assetExtensionMismatch,
      });
    });
  });

  describe('dimensions', () => {
    it('rejects a wrong size when the specification is verified', () => {
      const issues = validateAssets(
        withBackground(),
        aCatalog({ 'bg1.png': foundAsset(png(960, 544)) }),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: VALIDATION_CODES.assetWrongDimensions,
        details: { expectedWidth: 960, expectedHeight: 512, actualWidth: 960, actualHeight: 544 },
      });
    });

    it('only warns about a wrong size when the specification is community-reported', () => {
      const project = anAssetlessThemeProject({
        metadata: aThemeMetadata({ startScreenPreview: null, packageThumbnail: null }),
      });

      const issues = validateAssets(
        project,
        aCatalog({ 'preview_home.png': foundAsset(png(382, 217)) }),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'warning',
        code: VALIDATION_CODES.assetWrongDimensions,
      });
      expect(isExportable(validationReport(issues))).toBe(true);
    });
  });

  describe('encoding', () => {
    it('warns about a bit depth above eight', () => {
      const issues = validateAssets(
        withBackground(),
        aCatalog({
          'bg1.png': foundAsset(png(960, 512, { bitDepth: 16, colorModel: 'truecolor' })),
        }),
      );

      expect(codesIn(validationReport(issues))).toContain(VALIDATION_CODES.assetBitDepthTooHigh);
    });

    it('warns about transparency on an asset that is always drawn opaque', () => {
      const issues = validateAssets(
        withBackground(),
        aCatalog({ 'bg1.png': foundAsset(png(960, 512, { hasTransparency: true })) }),
      );

      expect(codesIn(validationReport(issues))).toEqual([
        VALIDATION_CODES.assetUnexpectedTransparency,
      ]);
    });

    it('accepts transparency on an asset that is meant to have it', () => {
      const project = anAssetlessThemeProject({
        informationBar: anInformationBar({ newNoticeIcon: null }),
      });

      const issues = validateAssets(
        project,
        aCatalog({
          'notices.png': foundAsset(
            png(120, 110, { colorModel: 'truecolor-alpha', hasTransparency: true }),
          ),
        }),
      );

      expect(issues).toEqual([]);
    });

    it('suggests an indexed PNG for an opaque asset stored as truecolor', () => {
      const issues = validateAssets(
        withBackground(),
        aCatalog({ 'bg1.png': foundAsset(png(960, 512, { colorModel: 'truecolor' })) }),
      );

      expect(codesIn(validationReport(issues))).toEqual([VALIDATION_CODES.assetNotIndexed]);
    });
  });

  describe('background music', () => {
    const withMusic = () =>
      anAssetlessThemeProject({
        home: aHomeScreen({
          pages: [],
          basePageIndicator: null,
          currentPageIndicator: null,
          backgroundMusic: assetPath('BGM.at9'),
        }),
      });

    it('accepts an ATRAC9 file', () => {
      expect(validateAssets(withMusic(), aCatalog({ 'BGM.at9': foundAsset(atrac9) }))).toEqual([]);
    });

    it('rejects an uncompressed WAV renamed to .at9', () => {
      const issues = validateAssets(
        withMusic(),
        aCatalog({
          'BGM.at9': foundAsset({
            kind: 'audio',
            format: 'wav',
            sampleRate: 44100,
            channelCount: 2,
          }),
        }),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: VALIDATION_CODES.assetWrongAudioFormat,
      });
      expect(issues[0]?.message).toContain('Convert the source audio to AT9');
    });
  });

  describe('distribution size', () => {
    it('warns once the theme approaches the sharing limit', () => {
      const issues = validateAssets(
        withBackground(),
        aCatalog({ 'bg1.png': foundAsset(png(960, 512), MAX_DISTRIBUTION_ARCHIVE_BYTES) }),
      );

      expect(codesIn(validationReport(issues))).toEqual([
        VALIDATION_CODES.assetTotalSizeExceedsDistributionLimit,
      ]);
    });

    it('counts a file shared by several pages only once', () => {
      const shared = assetPath('shared.png');
      const mostOfTheLimit = Math.ceil(MAX_DISTRIBUTION_ARCHIVE_BYTES * 0.6);
      const project = anAssetlessThemeProject({
        home: aHomeScreen({
          pages: [
            aLiveAreaPage({ background: shared, thumbnail: null }),
            aLiveAreaPage({ background: shared, thumbnail: null }),
          ],
          basePageIndicator: null,
          currentPageIndicator: null,
        }),
      });

      const report = validationReport(
        validateAssets(
          project,
          aCatalog({ 'shared.png': foundAsset(png(960, 512), mostOfTheLimit) }),
        ),
      );

      expect(errorsIn(report)).toEqual([]);
      expect(codesIn(report)).not.toContain(
        VALIDATION_CODES.assetTotalSizeExceedsDistributionLimit,
      );
    });
  });
});

describe('a picture in a format nothing here can read', () => {
  it('says what it is and what to do about it', () => {
    const issues = validateAssets(
      withBackground('lock-screen.bin'),
      aCatalog({ 'lock-screen.bin': foundAsset({ kind: 'unrecognized', container: 'webp' }) }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('a WEBP image');
    expect(issues[0]?.message).toContain('save it as a PNG or JPEG first');
  });

  it('says only what it knows about a file it cannot name', () => {
    const issues = validateAssets(
      withBackground('lock-screen.bin'),
      aCatalog({ 'lock-screen.bin': foundAsset({ kind: 'unrecognized' }) }),
    );

    expect(issues[0]?.message).toContain('an unrecognised file type');
    expect(issues[0]?.message).not.toContain('save it as');
  });
});
