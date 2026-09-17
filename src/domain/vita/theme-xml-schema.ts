/**
 * Element and attribute names of `theme.xml`, the manifest the PS Vita reads.
 *
 * These names are dictated by the console's parser and include two misspellings Sony
 * shipped (`InfomationBarProperty`, `InfomationProperty`). They must be reproduced exactly:
 * correcting them makes the theme unreadable on hardware.
 */
export const THEME_XML_FILE_NAME = 'theme.xml';

export const THEME_XML_ROOT = 'theme';
export const THEME_XML_FORMAT_VERSION_ATTRIBUTE = 'format-ver';
export const THEME_XML_PACKAGE_ATTRIBUTE = 'package';

/** The only format version seen in the wild. */
export const THEME_XML_FORMAT_VERSION = '01.00';

/** `0` marks a theme installed from a folder rather than a signed PSN package. */
export const THEME_XML_PACKAGE_UNSIGNED = '0';

export const THEME_XML_ELEMENTS = {
  homeProperty: 'HomeProperty',
  backgroundParams: 'm_bgParam',
  backgroundParam: 'BackgroundParam',
  backgroundImagePath: 'm_imageFilePath',
  backgroundThumbnailPath: 'm_thumbnailFilePath',
  waveType: 'm_waveType',
  bubbleFontColor: 'm_fontColor',
  bubbleFontShadow: 'm_fontShadow',
  backgroundMusicPath: 'm_bgmFilePath',
  appIconPath: 'm_iconFilePath',
  basePageIndicatorPath: 'm_basePageFilePath',
  currentPageIndicatorPath: 'm_curPageFilePath',

  informationBarProperty: 'InfomationBarProperty',
  barColor: 'm_barColor',
  indicatorColor: 'm_indicatorColor',
  noticeFontColor: 'm_noticeFontColor',
  noticeGlowColor: 'm_noticeGlowColor',
  noNoticeIconPath: 'm_noNoticeFilePath',
  newNoticeIconPath: 'm_newNoticeFilePath',

  informationProperty: 'InfomationProperty',
  provider: 'm_provider',
  contentVersion: 'm_contentVer',
  title: 'm_title',
  localizedDefault: 'm_default',
  localizedParams: 'm_param',
  homePreviewPath: 'm_homePreviewFilePath',
  startScreenPreviewPath: 'm_startPreviewFilePath',
  packageThumbnailPath: 'm_packageImageFilePath',

  startScreenProperty: 'StartScreenProperty',
  dateColor: 'm_dateColor',
  dateLayout: 'm_dateLayout',
  startScreenBackgroundPath: 'm_filePath',
  notificationBackgroundColor: 'm_notifyBgColor',
  notificationBorderColor: 'm_notifyBorderColor',
  notificationFontColor: 'm_notifyFontColor',
} as const;

/** Localised values are keyed by `m_<language code>`, e.g. `m_fr`. */
export const LOCALIZED_PARAM_PREFIX = 'm_';

export const localizedParamTag = (languageCode: string): string =>
  `${LOCALIZED_PARAM_PREFIX}${languageCode}`;

export const languageCodeFromParamTag = (tag: string): string | null =>
  tag.startsWith(LOCALIZED_PARAM_PREFIX) ? tag.slice(LOCALIZED_PARAM_PREFIX.length) || null : null;
