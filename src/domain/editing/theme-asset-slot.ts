import type { MediaDescriptor } from '../model/media';
import { parseThemeAssetPath, type ThemeAssetPath } from '../model/theme-asset-path';
import { withPreviewAsset, type ThemeAssetUsage, type ThemeProject } from '../model/theme-project';
import { failure, success, type Result } from '../shared/result';
import type { HomeAppSlotId } from '../vita/home-app-slots';

/**
 * Where a file sits in a theme.
 *
 * The validator works from a theme outwards, asking what each field refers to. An editor
 * works the other way: somebody points at a place in the theme and says "put this here". A
 * slot is that place, named rather than described by a path, which is what lets the window
 * ask for a change without ever handling a location on disk.
 */
export type ThemeAssetSlot =
  | { readonly kind: 'liveAreaBackground'; readonly page: number }
  | { readonly kind: 'liveAreaThumbnail'; readonly page: number }
  | { readonly kind: 'appIcon'; readonly application: HomeAppSlotId }
  | { readonly kind: 'basePageIndicator' }
  | { readonly kind: 'currentPageIndicator' }
  | { readonly kind: 'backgroundMusic' }
  | { readonly kind: 'noNoticeBadge' }
  | { readonly kind: 'newNoticeBadge' }
  | { readonly kind: 'startScreenBackground' }
  | { readonly kind: 'homePreview' }
  | { readonly kind: 'startScreenPreview' }
  | { readonly kind: 'packageThumbnail' };

/** Which specification the validator applies to whatever is put in the slot. */
export const assetSlotUsage = (slot: ThemeAssetSlot): ThemeAssetUsage => {
  switch (slot.kind) {
    case 'liveAreaBackground':
      return 'liveAreaBackground';
    case 'liveAreaThumbnail':
      return 'liveAreaThumbnail';
    case 'appIcon':
      return 'appIcon';
    case 'basePageIndicator':
    case 'currentPageIndicator':
      return 'pageIndicator';
    case 'backgroundMusic':
      return 'backgroundMusic';
    case 'noNoticeBadge':
    case 'newNoticeBadge':
      return 'notificationBadge';
    case 'startScreenBackground':
      return 'startScreenBackground';
    case 'homePreview':
      return 'homePreview';
    case 'startScreenPreview':
      return 'startScreenPreview';
    case 'packageThumbnail':
      return 'packageThumbnail';
  }
};

const pageAt = (project: ThemeProject, index: number) => project.home.pages[index];

export const assetAtSlot = (project: ThemeProject, slot: ThemeAssetSlot): ThemeAssetPath | null => {
  switch (slot.kind) {
    case 'liveAreaBackground':
      return pageAt(project, slot.page)?.background ?? null;
    case 'liveAreaThumbnail':
      return pageAt(project, slot.page)?.thumbnail ?? null;
    case 'appIcon':
      return project.home.appIcons.get(slot.application) ?? null;
    case 'basePageIndicator':
      return project.home.basePageIndicator;
    case 'currentPageIndicator':
      return project.home.currentPageIndicator;
    case 'backgroundMusic':
      return project.home.backgroundMusic;
    case 'noNoticeBadge':
      return project.informationBar.noNoticeIcon;
    case 'newNoticeBadge':
      return project.informationBar.newNoticeIcon;
    case 'startScreenBackground':
      return project.startScreen.background;
    case 'homePreview':
      return project.metadata.homePreview;
    case 'startScreenPreview':
      return project.metadata.startScreenPreview;
    case 'packageThumbnail':
      return project.metadata.packageThumbnail;
  }
};

const withPage = (
  project: ThemeProject,
  index: number,
  change: (page: NonNullable<ReturnType<typeof pageAt>>) => NonNullable<ReturnType<typeof pageAt>>,
): ThemeProject => {
  const page = pageAt(project, index);
  if (page === undefined) {
    return project;
  }

  return {
    ...project,
    home: {
      ...project.home,
      pages: project.home.pages.map((candidate, position) =>
        position === index ? change(page) : candidate,
      ),
    },
  };
};

const withAppIcon = (
  project: ThemeProject,
  application: HomeAppSlotId,
  path: ThemeAssetPath | null,
): ThemeProject => {
  const appIcons = new Map(project.home.appIcons);
  if (path === null) {
    appIcons.delete(application);
  } else {
    appIcons.set(application, path);
  }

  return { ...project, home: { ...project.home, appIcons } };
};

/** Puts a file in a slot, or empties it. A slot that is not there is left alone. */
export const withAssetAtSlot = (
  project: ThemeProject,
  slot: ThemeAssetSlot,
  path: ThemeAssetPath | null,
): ThemeProject => {
  switch (slot.kind) {
    case 'liveAreaBackground':
      return withPage(project, slot.page, (page) => ({
        ...page,
        background: path,
        // A generated thumbnail without its source has no useful meaning.
        ...(path === null && page.generatedThumbnail
          ? { thumbnail: null, generatedThumbnail: false }
          : {}),
      }));
    case 'liveAreaThumbnail':
      return withPage(project, slot.page, (page) => ({
        ...page,
        thumbnail: path,
        generatedThumbnail: false,
      }));
    case 'appIcon':
      return withAppIcon(project, slot.application, path);
    case 'basePageIndicator':
      return { ...project, home: { ...project.home, basePageIndicator: path } };
    case 'currentPageIndicator':
      return { ...project, home: { ...project.home, currentPageIndicator: path } };
    case 'backgroundMusic':
      return { ...project, home: { ...project.home, backgroundMusic: path } };
    case 'noNoticeBadge':
      return { ...project, informationBar: { ...project.informationBar, noNoticeIcon: path } };
    case 'newNoticeBadge':
      return { ...project, informationBar: { ...project.informationBar, newNoticeIcon: path } };
    case 'startScreenBackground':
      return { ...project, startScreen: { ...project.startScreen, background: path } };
    // Putting a file in a preview slot by hand makes the preview the author's, whatever was
    // there before; only generation says otherwise, and it says so explicitly.
    case 'homePreview':
    case 'startScreenPreview':
    case 'packageThumbnail':
      return withPreviewAsset(project, slot.kind, path, 'custom');
  }
};

/**
 * What a file is called once it is part of the theme.
 *
 * The name comes from the slot, never from the file it was taken from: a name chosen
 * somewhere else is untrusted input, and a theme reads better when its files say what they
 * are. The extension comes from what the file turned out to *be*, so a manifest never claims
 * a JPEG is a PNG — the validator then reports the mismatch rather than the theme hiding it.
 */
const SLOT_STEMS: Readonly<Record<ThemeAssetSlot['kind'], string>> = {
  liveAreaBackground: 'background',
  liveAreaThumbnail: 'background-thumbnail',
  appIcon: 'icon',
  basePageIndicator: 'page-dot',
  currentPageIndicator: 'page-dot-current',
  backgroundMusic: 'music',
  noNoticeBadge: 'notification-none',
  newNoticeBadge: 'notification-new',
  startScreenBackground: 'lock-screen',
  homePreview: 'preview-home',
  startScreenPreview: 'preview-lock-screen',
  packageThumbnail: 'preview-thumbnail',
};

/** Unrecognised files keep a neutral extension rather than one that suggests a format. */
const UNKNOWN_EXTENSION = '.bin';

export const assetFileExtension = (media: MediaDescriptor): string => {
  switch (media.kind) {
    case 'image':
      return media.format === 'jpeg' ? '.jpg' : `.${media.format}`;
    case 'audio':
      return `.${media.format}`;
    case 'unrecognized':
      return UNKNOWN_EXTENSION;
  }
};

export type AssetSlotNameError = 'unusable-name';

export const assetSlotFileName = (
  slot: ThemeAssetSlot,
  media: MediaDescriptor,
): Result<ThemeAssetPath, AssetSlotNameError> => {
  const stem = SLOT_STEMS[slot.kind];

  const qualified =
    slot.kind === 'liveAreaBackground' || slot.kind === 'liveAreaThumbnail'
      ? `${stem}-${String(slot.page + 1)}`
      : slot.kind === 'appIcon'
        ? `${stem}-${slot.application}`
        : stem;

  const parsed = parseThemeAssetPath(`${qualified}${assetFileExtension(media)}`);
  return parsed.ok ? success(parsed.value) : failure('unusable-name');
};
