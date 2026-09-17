import type { ThemeImageAssetKind } from '../vita/asset-specs';
import type { HomeAppSlotId } from '../vita/home-app-slots';
import type { ThemePreviewKind } from '../vita/theme-previews';
import { INITIAL_CONTENT_VERSION, type ContentVersion } from './content-version';
import { localizedText, type LocalizedText } from './localized-text';
import type { ThemeAssetPath } from './theme-asset-path';
import type { ThemeColor } from './theme-color';

/**
 * The theme being edited, independent of how it is stored on disk.
 *
 * Every asset and colour is nullable because an editable theme is legitimately incomplete:
 * the console falls back to its own defaults for anything a theme leaves unset, and the
 * editor must be able to represent a project half-way through being authored.
 */
export interface ThemeProject {
  readonly metadata: ThemeMetadata;
  readonly home: HomeScreen;
  readonly informationBar: InformationBar;
  readonly startScreen: StartScreen;
}

export interface ThemeMetadata {
  readonly title: LocalizedText;
  /** `m_provider`: the theme's author, as shown by the console. */
  readonly provider: LocalizedText;
  readonly contentVersion: ContentVersion;
  readonly homePreview: ThemeAssetPath | null;
  readonly startScreenPreview: ThemeAssetPath | null;
  readonly packageThumbnail: ThemeAssetPath | null;
  /**
   * Which of the three previews VitaTheme drew, rather than the author supplying them.
   *
   * The console cannot tell the difference and `theme.xml` has nowhere to say it, so this
   * is the project's own record, and it exists to answer one question: may this picture be
   * replaced without being asked? A preview somebody chose is theirs, and is never written
   * over on the application's initiative — which is only decidable if the application
   * remembers which ones were its own. See `editing/preview-provenance`.
   */
  readonly generatedPreviews: ReadonlySet<ThemePreviewKind>;
}

export interface HomeScreen {
  readonly pages: readonly LiveAreaPage[];
  readonly backgroundMusic: ThemeAssetPath | null;
  readonly appIcons: ReadonlyMap<HomeAppSlotId, ThemeAssetPath>;
  readonly basePageIndicator: ThemeAssetPath | null;
  readonly currentPageIndicator: ThemeAssetPath | null;
}

export interface LiveAreaPage {
  readonly background: ThemeAssetPath | null;
  readonly thumbnail: ThemeAssetPath | null;
  /** Project-only provenance. An imported or manually supplied thumbnail is always custom. */
  readonly generatedThumbnail: boolean;
  /**
   * Index of the stock animated background revealed while swiping between pages. Stored as
   * a plain number: the console's accepted range is undocumented, so values are preserved
   * rather than constrained. See `WAVE_TYPE_IS_DOCUMENTED`.
   */
  readonly waveType: number | null;
  /** Colour of the label under each application bubble. */
  readonly bubbleFontColor: ThemeColor | null;
  readonly bubbleFontShadow: boolean | null;
}

export interface InformationBar {
  readonly barColor: ThemeColor | null;
  readonly indicatorColor: ThemeColor | null;
  readonly noticeFontColor: ThemeColor | null;
  readonly noticeGlowColor: ThemeColor | null;
  readonly noNoticeIcon: ThemeAssetPath | null;
  readonly newNoticeIcon: ThemeAssetPath | null;
}

export interface StartScreen {
  readonly background: ThemeAssetPath | null;
  readonly dateColor: ThemeColor | null;
  /** Clock placement. Stored as a number for the same reason as `waveType`. */
  readonly dateLayout: number | null;
  readonly notificationBackgroundColor: ThemeColor | null;
  readonly notificationBorderColor: ThemeColor | null;
  readonly notificationFontColor: ThemeColor | null;
}

export const emptyLiveAreaPage = (): LiveAreaPage => ({
  background: null,
  thumbnail: null,
  generatedThumbnail: false,
  waveType: null,
  bubbleFontColor: null,
  bubbleFontShadow: null,
});

/**
 * A theme that has just been started.
 *
 * Everything the console falls back on is left unset rather than filled with a guess; the
 * one page exists because a theme that styles no page is not a theme, which is the only
 * structural rule the format is certain about here.
 */
export const newThemeProject = (metadata: {
  readonly title: string;
  readonly provider: string;
}): ThemeProject => ({
  metadata: {
    title: localizedText(metadata.title),
    provider: localizedText(metadata.provider),
    contentVersion: INITIAL_CONTENT_VERSION,
    homePreview: null,
    startScreenPreview: null,
    packageThumbnail: null,
    generatedPreviews: new Set(),
  },
  home: {
    pages: [emptyLiveAreaPage()],
    backgroundMusic: null,
    appIcons: new Map(),
    basePageIndicator: null,
    currentPageIndicator: null,
  },
  informationBar: {
    barColor: null,
    indicatorColor: null,
    noticeFontColor: null,
    noticeGlowColor: null,
    noNoticeIcon: null,
    newNoticeIcon: null,
  },
  startScreen: {
    background: null,
    dateColor: null,
    dateLayout: null,
    notificationBackgroundColor: null,
    notificationBorderColor: null,
    notificationFontColor: null,
  },
});

/**
 * Where a preview came from: the application drew it, or somebody supplied it.
 *
 * Every way of putting a file in a preview slot goes through `withPreviewAsset`, and every
 * one of them but generation passes `custom`. That is deliberate: choosing a file, dropping
 * one, converting one and clearing a slot all make the slot the author's, and none of them
 * has to remember to say so.
 */
export type PreviewOrigin = 'generated' | 'custom';

const PREVIEW_FIELDS: Readonly<Record<ThemePreviewKind, keyof ThemeMetadata>> = {
  homePreview: 'homePreview',
  startScreenPreview: 'startScreenPreview',
  packageThumbnail: 'packageThumbnail',
};

export const withPreviewAsset = (
  project: ThemeProject,
  kind: ThemePreviewKind,
  path: ThemeAssetPath | null,
  origin: PreviewOrigin,
): ThemeProject => {
  const generatedPreviews = new Set(project.metadata.generatedPreviews);
  // A slot that is emptied holds nothing to have been generated, so the record goes with it.
  if (origin === 'generated' && path !== null) {
    generatedPreviews.add(kind);
  } else {
    generatedPreviews.delete(kind);
  }

  return {
    ...project,
    metadata: { ...project.metadata, [PREVIEW_FIELDS[kind]]: path, generatedPreviews },
  };
};

/** Every asset a project references, in a stable order, for iteration by the validator. */
export const collectAssetReferences = (project: ThemeProject): readonly ThemeAssetReference[] => {
  const references: ThemeAssetReference[] = [];

  const add = (path: ThemeAssetPath | null, usage: ThemeAssetUsage, location: string): void => {
    if (path !== null) {
      references.push({ path, usage, location });
    }
  };

  project.home.pages.forEach((page, index) => {
    const location = `home.pages[${String(index)}]`;
    add(page.background, 'liveAreaBackground', `${location}.background`);
    add(page.thumbnail, 'liveAreaThumbnail', `${location}.thumbnail`);
  });

  for (const [slotId, path] of project.home.appIcons) {
    add(path, 'appIcon', `home.appIcons.${slotId}`);
  }

  add(project.home.basePageIndicator, 'pageIndicator', 'home.basePageIndicator');
  add(project.home.currentPageIndicator, 'pageIndicator', 'home.currentPageIndicator');
  add(project.home.backgroundMusic, 'backgroundMusic', 'home.backgroundMusic');

  add(project.informationBar.noNoticeIcon, 'notificationBadge', 'informationBar.noNoticeIcon');
  add(project.informationBar.newNoticeIcon, 'notificationBadge', 'informationBar.newNoticeIcon');

  add(project.startScreen.background, 'startScreenBackground', 'startScreen.background');

  add(project.metadata.homePreview, 'homePreview', 'metadata.homePreview');
  add(project.metadata.startScreenPreview, 'startScreenPreview', 'metadata.startScreenPreview');
  add(project.metadata.packageThumbnail, 'packageThumbnail', 'metadata.packageThumbnail');

  return references;
};

/** What an asset is used for; drives which specification the validator applies to it. */
export type ThemeAssetUsage = ThemeImageAssetKind | 'backgroundMusic';

export interface ThemeAssetReference {
  readonly path: ThemeAssetPath;
  readonly usage: ThemeAssetUsage;
  /** Dotted path to the field inside the project, used to anchor validation issues. */
  readonly location: string;
}

/**
 * Every distinct file a theme references, in a stable order.
 *
 * A theme legitimately points several fields at the same file — one background reused
 * across pages, one icon shared by two slots. Callers that act on files rather than on
 * fields (inspecting them, copying them into an export) must see each file once.
 */
export const distinctAssetPaths = (project: ThemeProject): readonly ThemeAssetPath[] => [
  ...new Set(collectAssetReferences(project).map((reference) => reference.path)),
];
