import { INITIAL_CONTENT_VERSION } from '@/domain/model/content-version';
import { localizedText } from '@/domain/model/localized-text';
import type { InspectedAsset } from '@/domain/model/media';
import { parseThemeAssetPath, type ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { parseThemeColor, type ThemeColor } from '@/domain/model/theme-color';
import type {
  HomeScreen,
  InformationBar,
  LiveAreaPage,
  StartScreen,
  ThemeMetadata,
  ThemeProject,
} from '@/domain/model/theme-project';
import {
  assetCatalogOf,
  type AssetCatalog,
  type AssetLookup,
} from '@/domain/validation/asset-catalog';
import type { ValidationReport } from '@/domain/validation/report';
import type { ValidationCode, ValidationIssue } from '@/domain/validation/issue';

/** Builds a validated asset path, failing the test immediately if the fixture itself is wrong. */
export const assetPath = (raw: string): ThemeAssetPath => {
  const parsed = parseThemeAssetPath(raw);
  if (!parsed.ok) {
    throw new Error(`Test fixture uses an invalid asset path: ${raw} (${parsed.error})`);
  }
  return parsed.value;
};

export const color = (raw: string): ThemeColor => {
  const parsed = parseThemeColor(raw);
  if (!parsed.ok) {
    throw new Error(`Test fixture uses an invalid colour: ${raw} (${parsed.error})`);
  }
  return parsed.value;
};

export const aLiveAreaPage = (overrides: Partial<LiveAreaPage> = {}): LiveAreaPage => ({
  background: assetPath('bg1.png'),
  thumbnail: assetPath('bg1t.png'),
  generatedThumbnail: false,
  waveType: 24,
  bubbleFontColor: color('FFFFFF'),
  bubbleFontShadow: true,
  ...overrides,
});

export const aThemeMetadata = (overrides: Partial<ThemeMetadata> = {}): ThemeMetadata => ({
  title: localizedText('Example Theme'),
  provider: localizedText('Example Author'),
  contentVersion: INITIAL_CONTENT_VERSION,
  homePreview: assetPath('preview_home.png'),
  startScreenPreview: assetPath('preview_start.png'),
  packageThumbnail: assetPath('preview_thumbnail.png'),
  generatedPreviews: new Set(),
  ...overrides,
});

export const aHomeScreen = (overrides: Partial<HomeScreen> = {}): HomeScreen => ({
  pages: [aLiveAreaPage()],
  backgroundMusic: null,
  appIcons: new Map(),
  basePageIndicator: assetPath('basePage.png'),
  currentPageIndicator: assetPath('curPage.png'),
  ...overrides,
});

export const anInformationBar = (overrides: Partial<InformationBar> = {}): InformationBar => ({
  barColor: color('FF202020'),
  indicatorColor: color('FFFFFFFF'),
  noticeFontColor: color('FFFFFFFF'),
  noticeGlowColor: color('00D1FF'),
  noNoticeIcon: assetPath('notices.png'),
  newNoticeIcon: assetPath('notice.png'),
  ...overrides,
});

export const aStartScreen = (overrides: Partial<StartScreen> = {}): StartScreen => ({
  background: assetPath('lockpaper.png'),
  dateColor: color('FFFFFF'),
  dateLayout: 0,
  notificationBackgroundColor: color('64FFFFFF'),
  notificationBorderColor: color('20FFFFFF'),
  notificationFontColor: color('FFFFFF'),
  ...overrides,
});

export const aThemeProject = (overrides: Partial<ThemeProject> = {}): ThemeProject => ({
  metadata: aThemeMetadata(),
  home: aHomeScreen(),
  informationBar: anInformationBar(),
  startScreen: aStartScreen(),
  ...overrides,
});

export const foundAsset = (media: InspectedAsset['media'], byteSize = 1024): AssetLookup => ({
  status: 'found',
  asset: { byteSize, media },
});

export const aCatalog = (entries: Record<string, AssetLookup>): AssetCatalog =>
  assetCatalogOf(new Map(Object.entries(entries)));

export const codesIn = (report: ValidationReport): readonly ValidationCode[] =>
  report.issues.map((reported) => reported.code);

export const issuesWithCode = (
  report: ValidationReport,
  code: ValidationCode,
): readonly ValidationIssue[] => report.issues.filter((reported) => reported.code === code);

/**
 * A project that references no assets at all. Tests add back only the asset they exercise,
 * so a report contains exactly the issues under test and nothing incidental.
 */
export const anAssetlessThemeProject = (overrides: Partial<ThemeProject> = {}): ThemeProject =>
  aThemeProject({
    metadata: aThemeMetadata({
      homePreview: null,
      startScreenPreview: null,
      packageThumbnail: null,
    }),
    home: aHomeScreen({ pages: [], basePageIndicator: null, currentPageIndicator: null }),
    informationBar: anInformationBar({ noNoticeIcon: null, newNoticeIcon: null }),
    startScreen: aStartScreen({ background: null }),
    ...overrides,
  });
