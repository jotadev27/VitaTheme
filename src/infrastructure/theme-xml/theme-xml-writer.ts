import { formatContentVersion } from '../../domain/model/content-version';
import type { LocalizedText } from '../../domain/model/localized-text';
import { formatThemeColor, opaqueColor, type ThemeColor } from '../../domain/model/theme-color';
import type {
  InformationBar,
  LiveAreaPage,
  StartScreen,
  ThemeMetadata,
  ThemeProject,
} from '../../domain/model/theme-project';
import { HOME_APP_SLOT_IDS, homeAppSlot } from '../../domain/vita/home-app-slots';
import { isObservedLanguageCode, OBSERVED_THEME_LANGUAGE_CODES } from '../../domain/vita/languages';
import {
  localizedParamTag,
  THEME_XML_ELEMENTS,
  THEME_XML_FORMAT_VERSION,
  THEME_XML_FORMAT_VERSION_ATTRIBUTE,
  THEME_XML_PACKAGE_ATTRIBUTE,
  THEME_XML_PACKAGE_UNSIGNED,
  THEME_XML_ROOT,
} from '../../domain/vita/theme-xml-schema';
import { renderXmlDocument, xmlBranch, xmlText, type XmlElement } from './xml-writer';

const ELEMENTS = THEME_XML_ELEMENTS;

/**
 * Omits an element entirely when the project leaves the field unset.
 *
 * Most unset fields are omitted. Notification image paths are written explicitly
 * when cleared, matching the empty elements produced by other theme editors.
 */
const optional = <TValue>(
  tag: string,
  value: TValue | null,
  render: (value: TValue) => string,
): readonly XmlElement[] => (value === null ? [] : [xmlText(tag, render(value))]);

const identity = (value: string): string => value;

const optionalColor = (tag: string, color: ThemeColor | null): readonly XmlElement[] =>
  optional(tag, color, formatThemeColor);

const optionalPath = (tag: string, path: string | null): readonly XmlElement[] =>
  optional(tag, path, identity);

/**
 * Orders translations deterministically — catalogued languages first, then anything else
 * alphabetically — so exporting the same project twice produces byte-identical output.
 */
const orderedLanguageCodes = (text: LocalizedText): readonly string[] => {
  const present = new Set(text.translations.keys());
  const known = OBSERVED_THEME_LANGUAGE_CODES.filter((code) => present.has(code));
  const unknown = [...present].filter((code) => !isObservedLanguageCode(code)).sort();
  return [...known, ...unknown];
};

const renderLocalizedText = (tag: string, text: LocalizedText): XmlElement => {
  const languageCodes = orderedLanguageCodes(text);
  const params = languageCodes.map((code) =>
    xmlText(localizedParamTag(code), text.translations.get(code) ?? ''),
  );

  return xmlBranch(tag, [
    xmlText(ELEMENTS.localizedDefault, text.defaultValue),
    ...(params.length === 0 ? [] : [xmlBranch(ELEMENTS.localizedParams, params)]),
  ]);
};

const renderLiveAreaPage = (page: LiveAreaPage): XmlElement =>
  xmlBranch(ELEMENTS.backgroundParam, [
    ...optionalPath(ELEMENTS.backgroundImagePath, page.background),
    ...optionalPath(ELEMENTS.backgroundThumbnailPath, page.thumbnail),
    ...optional(ELEMENTS.waveType, page.waveType, String),
    ...optionalColor(ELEMENTS.bubbleFontColor, page.bubbleFontColor),
    ...optional(ELEMENTS.bubbleFontShadow, page.bubbleFontShadow, (on) => (on ? '1' : '0')),
  ]);

const renderHomeProperty = ({ home }: ThemeProject): XmlElement => {
  const appIcons = HOME_APP_SLOT_IDS.flatMap((slotId) => {
    const path = home.appIcons.get(slotId);
    return path === undefined
      ? []
      : [xmlBranch(homeAppSlot(slotId).xmlTag, [xmlText(ELEMENTS.appIconPath, path)])];
  });

  return xmlBranch(ELEMENTS.homeProperty, [
    xmlBranch(ELEMENTS.backgroundParams, home.pages.map(renderLiveAreaPage)),
    ...optionalPath(ELEMENTS.backgroundMusicPath, home.backgroundMusic),
    ...appIcons,
    ...optionalPath(ELEMENTS.basePageIndicatorPath, home.basePageIndicator),
    ...optionalPath(ELEMENTS.currentPageIndicatorPath, home.currentPageIndicator),
  ]);
};

const renderInformationBarProperty = (bar: InformationBar): XmlElement =>
  xmlBranch(ELEMENTS.informationBarProperty, [
    ...optionalColor(ELEMENTS.barColor, bar.barColor),
    ...optionalColor(ELEMENTS.indicatorColor, bar.indicatorColor),
    ...optionalColor(ELEMENTS.noticeFontColor, bar.noticeFontColor),
    ...optionalColor(ELEMENTS.noticeGlowColor, bar.noticeGlowColor),
    // Keep reset commands in the manifest even after an image has been cleared.
    xmlText(ELEMENTS.noNoticeIconPath, bar.noNoticeIcon ?? ''),
    xmlText(ELEMENTS.newNoticeIconPath, bar.newNoticeIcon ?? ''),
  ]);

const renderInformationProperty = (metadata: ThemeMetadata): XmlElement =>
  xmlBranch(ELEMENTS.informationProperty, [
    renderLocalizedText(ELEMENTS.provider, metadata.provider),
    xmlText(ELEMENTS.contentVersion, formatContentVersion(metadata.contentVersion)),
    renderLocalizedText(ELEMENTS.title, metadata.title),
    ...optionalPath(ELEMENTS.homePreviewPath, metadata.homePreview),
    ...optionalPath(ELEMENTS.startScreenPreviewPath, metadata.startScreenPreview),
    ...optionalPath(ELEMENTS.packageThumbnailPath, metadata.packageThumbnail),
  ]);

const renderStartScreenProperty = (startScreen: StartScreen): XmlElement =>
  xmlBranch(ELEMENTS.startScreenProperty, [
    // A custom lock screen needs a visible clock even when its controls are left unset.
    // Write alpha explicitly: an RGB picker value must not become transparent ARGB.
    ...optional(
      ELEMENTS.dateColor,
      startScreen.dateColor ??
        (startScreen.background === null ? null : opaqueColor(255, 255, 255)),
      (color) => formatThemeColor({ ...color, hasExplicitAlpha: true }),
    ),
    ...optional(
      ELEMENTS.dateLayout,
      startScreen.dateLayout ?? (startScreen.background === null ? null : 0),
      String,
    ),
    ...optionalPath(ELEMENTS.startScreenBackgroundPath, startScreen.background),
    ...optionalColor(ELEMENTS.notificationBackgroundColor, startScreen.notificationBackgroundColor),
    ...optionalColor(ELEMENTS.notificationBorderColor, startScreen.notificationBorderColor),
    ...optionalColor(ELEMENTS.notificationFontColor, startScreen.notificationFontColor),
  ]);

/**
 * Writes `theme.xml`.
 *
 * Element order follows what the console's parser expects and matches the layout used by
 * community themes; it is not free to change.
 */
export const serializeThemeXml = (project: ThemeProject): string =>
  renderXmlDocument(
    xmlBranch(
      THEME_XML_ROOT,
      [
        renderHomeProperty(project),
        renderInformationBarProperty(project.informationBar),
        renderInformationProperty(project.metadata),
        renderStartScreenProperty(project.startScreen),
      ],
      [
        { name: THEME_XML_FORMAT_VERSION_ATTRIBUTE, value: THEME_XML_FORMAT_VERSION },
        { name: THEME_XML_PACKAGE_ATTRIBUTE, value: THEME_XML_PACKAGE_UNSIGNED },
      ],
    ),
  );
