import { describe, expect, it } from 'vitest';
import { localizedText } from '@/domain/model/localized-text';
import { VALIDATION_CODES } from '@/domain/validation/issue';
import { validateStructure } from '@/domain/validation/validate-structure';
import { validationReport } from '@/domain/validation/report';
import { HOME_APP_SLOT_IDS } from '@/domain/vita/home-app-slots';
import { MAX_LIVE_AREA_PAGES } from '@/domain/vita/live-area';
import {
  aHomeScreen,
  aLiveAreaPage,
  aStartScreen,
  aThemeMetadata,
  aThemeProject,
  anInformationBar,
  assetPath,
  codesIn,
} from '../support/theme-fixtures';

const codesFor = (project: Parameters<typeof validateStructure>[0]) =>
  codesIn(validationReport([...validateStructure(project)]));

describe('validateStructure', () => {
  it('reports nothing for a fully populated theme', () => {
    const project = aThemeProject({
      home: aHomeScreen({
        appIcons: new Map(HOME_APP_SLOT_IDS.map((slot) => [slot, assetPath(`icon_${slot}.png`)])),
      }),
    });

    expect(validateStructure(project)).toEqual([]);
  });

  describe('metadata', () => {
    it('requires a theme name', () => {
      const project = aThemeProject({
        metadata: aThemeMetadata({ title: localizedText('   ') }),
      });

      const issues = validateStructure(project);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: VALIDATION_CODES.metadataTitleEmpty,
        }),
      );
    });

    it('warns about a missing author without blocking the theme', () => {
      const project = aThemeProject({
        metadata: aThemeMetadata({ provider: localizedText('') }),
      });

      expect(codesFor(project)).toEqual([VALIDATION_CODES.metadataProviderEmpty]);
    });

    it('warns about a language code no known theme uses, but keeps it', () => {
      const project = aThemeProject({
        metadata: aThemeMetadata({
          title: localizedText('Example', new Map([['xx', 'Ejemplo']])),
        }),
      });

      expect(codesFor(project)).toEqual([VALIDATION_CODES.metadataUnknownLanguageCode]);
    });

    it('warns about an empty translation that would hide the default value', () => {
      const project = aThemeProject({
        metadata: aThemeMetadata({
          title: localizedText('Example', new Map([['fr', '  ']])),
        }),
      });

      expect(codesFor(project)).toEqual([VALIDATION_CODES.metadataTranslationEmpty]);
    });

    it('warns once per missing preview image', () => {
      const project = aThemeProject({
        metadata: aThemeMetadata({
          homePreview: null,
          startScreenPreview: null,
          packageThumbnail: null,
        }),
      });

      expect(codesFor(project)).toEqual([
        VALIDATION_CODES.metadataPreviewMissing,
        VALIDATION_CODES.metadataPreviewMissing,
        VALIDATION_CODES.metadataPreviewMissing,
      ]);
    });
  });

  describe('home screen', () => {
    it('requires at least one styled page', () => {
      const project = aThemeProject({ home: aHomeScreen({ pages: [] }) });

      expect(codesFor(project)).toContain(VALIDATION_CODES.homeNoPages);
    });

    it('rejects more pages than the console has', () => {
      const project = aThemeProject({
        home: aHomeScreen({
          pages: Array.from({ length: MAX_LIVE_AREA_PAGES + 1 }, () => aLiveAreaPage()),
        }),
      });

      const issues = validateStructure(project);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: VALIDATION_CODES.homeTooManyPages,
          details: { maxPages: MAX_LIVE_AREA_PAGES, actualPages: MAX_LIVE_AREA_PAGES + 1 },
        }),
      );
    });

    it('treats a page without a background as a deliberate stock background', () => {
      const project = aThemeProject({
        home: aHomeScreen({ pages: [aLiveAreaPage({ background: null, thumbnail: null })] }),
      });

      const issues = validateStructure(project);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'warning',
        code: VALIDATION_CODES.homePageBackgroundMissing,
      });
    });

    it('warns when a themed page has no thumbnail to show in the wallpaper browser', () => {
      const project = aThemeProject({
        home: aHomeScreen({ pages: [aLiveAreaPage({ thumbnail: null })] }),
      });

      expect(codesFor(project)).toEqual([VALIDATION_CODES.homePageThumbnailMissing]);
    });

    it('warns about a partially themed icon set and names what is missing', () => {
      const themed = HOME_APP_SLOT_IDS.slice(0, 3);
      const project = aThemeProject({
        home: aHomeScreen({
          appIcons: new Map(themed.map((slot) => [slot, assetPath(`icon_${slot}.png`)])),
        }),
      });

      const issues = validateStructure(project);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        code: VALIDATION_CODES.homeIconSetIncomplete,
        details: { missingCount: HOME_APP_SLOT_IDS.length - themed.length },
      });
      expect(issues[0]?.message).toContain('Settings');
    });

    it('stays quiet when no icon at all is themed', () => {
      const project = aThemeProject({ home: aHomeScreen({ appIcons: new Map() }) });

      expect(codesFor(project)).not.toContain(VALIDATION_CODES.homeIconSetIncomplete);
    });

    it('warns when only one of the two page indicator dots is themed', () => {
      const project = aThemeProject({
        home: aHomeScreen({ currentPageIndicator: null }),
      });

      expect(codesFor(project)).toEqual([VALIDATION_CODES.homePageIndicatorIncomplete]);
    });
  });

  describe('information bar', () => {
    it('warns when only one notification badge is themed', () => {
      const project = aThemeProject({
        informationBar: anInformationBar({ newNoticeIcon: null }),
      });

      expect(codesFor(project)).toEqual([VALIDATION_CODES.informationBarBadgeIncomplete]);
    });
  });

  describe('start screen', () => {
    it('warns about a missing lock screen background', () => {
      const project = aThemeProject({ startScreen: aStartScreen({ background: null }) });

      expect(codesFor(project)).toEqual([VALIDATION_CODES.startScreenBackgroundMissing]);
    });

    it('warns about an undocumented clock position and lists the known ones', () => {
      const project = aThemeProject({ startScreen: aStartScreen({ dateLayout: 7 }) });

      const issues = validateStructure(project);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'warning',
        code: VALIDATION_CODES.startScreenUnknownDateLayout,
        details: { dateLayout: 7 },
      });
      expect(issues[0]?.message).toContain('lower left');
    });

    it.each([0, 1, 2])('accepts the documented clock position %d', (dateLayout) => {
      const project = aThemeProject({ startScreen: aStartScreen({ dateLayout }) });

      expect(codesFor(project)).not.toContain(VALIDATION_CODES.startScreenUnknownDateLayout);
    });
  });
});
