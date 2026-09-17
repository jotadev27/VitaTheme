import { DOMParser, type Element } from '@xmldom/xmldom';
import type {
  ManifestParseError,
  ParsedThemeManifest,
} from '../../application/ports/theme-manifest-codec';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import type {
  HomeScreen,
  InformationBar,
  LiveAreaPage,
  StartScreen,
  ThemeMetadata,
  ThemeProject,
} from '../../domain/model/theme-project';
import { failure, success, type Result } from '../../domain/shared/result';
import {
  VALIDATION_CODES,
  validationWarning,
  type ValidationIssue,
} from '../../domain/validation/issue';
import {
  HOME_APP_SLOT_IDS,
  homeAppSlot,
  type HomeAppSlotId,
} from '../../domain/vita/home-app-slots';
import {
  THEME_XML_ELEMENTS,
  THEME_XML_FORMAT_VERSION,
  THEME_XML_FORMAT_VERSION_ATTRIBUTE,
  THEME_XML_ROOT,
} from '../../domain/vita/theme-xml-schema';
import {
  readAssetPath,
  readColor,
  readContentVersion,
  readFlag,
  readInteger,
  readLocalizedText,
  type FieldReadContext,
} from './field-readers';
import { attributeText, childElement, childElements } from './xml-dom';

const ELEMENTS = THEME_XML_ELEMENTS;

/**
 * A document type declaration can define entities that expand into far more data than the
 * document itself contains. The parser does not expand them, but a theme manifest has no
 * legitimate use for a declaration either, so one is refused before parsing begins.
 */
const DOCTYPE_DECLARATION = /<!DOCTYPE/i;

const readLiveAreaPage = (
  node: Element,
  index: number,
  context: FieldReadContext,
): LiveAreaPage => {
  const location = `home.pages[${String(index)}]`;

  return {
    background: readAssetPath(
      node,
      ELEMENTS.backgroundImagePath,
      `${location}.background`,
      context,
    ),
    thumbnail: readAssetPath(
      node,
      ELEMENTS.backgroundThumbnailPath,
      `${location}.thumbnail`,
      context,
    ),
    generatedThumbnail: false,
    waveType: readInteger(node, ELEMENTS.waveType, `${location}.waveType`, context),
    bubbleFontColor: readColor(
      node,
      ELEMENTS.bubbleFontColor,
      `${location}.bubbleFontColor`,
      context,
    ),
    bubbleFontShadow: readFlag(
      node,
      ELEMENTS.bubbleFontShadow,
      `${location}.bubbleFontShadow`,
      context,
    ),
  };
};

const readAppIcons = (
  home: Element | null,
  context: FieldReadContext,
): ReadonlyMap<HomeAppSlotId, ThemeAssetPath> => {
  const icons = new Map<HomeAppSlotId, ThemeAssetPath>();

  for (const slotId of HOME_APP_SLOT_IDS) {
    const slotNode = childElement(home, homeAppSlot(slotId).xmlTag);
    const path = readAssetPath(slotNode, ELEMENTS.appIconPath, `home.appIcons.${slotId}`, context);
    if (path !== null) {
      icons.set(slotId, path);
    }
  }

  return icons;
};

const readHomeScreen = (root: Element, context: FieldReadContext): HomeScreen => {
  const home = childElement(root, ELEMENTS.homeProperty);
  const backgroundParams = childElement(home, ELEMENTS.backgroundParams);

  return {
    pages: childElements(backgroundParams, ELEMENTS.backgroundParam).map((node, index) =>
      readLiveAreaPage(node, index, context),
    ),
    backgroundMusic: readAssetPath(
      home,
      ELEMENTS.backgroundMusicPath,
      'home.backgroundMusic',
      context,
    ),
    appIcons: readAppIcons(home, context),
    basePageIndicator: readAssetPath(
      home,
      ELEMENTS.basePageIndicatorPath,
      'home.basePageIndicator',
      context,
    ),
    currentPageIndicator: readAssetPath(
      home,
      ELEMENTS.currentPageIndicatorPath,
      'home.currentPageIndicator',
      context,
    ),
  };
};

const readInformationBar = (root: Element, context: FieldReadContext): InformationBar => {
  const bar = childElement(root, ELEMENTS.informationBarProperty);

  return {
    barColor: readColor(bar, ELEMENTS.barColor, 'informationBar.barColor', context),
    indicatorColor: readColor(
      bar,
      ELEMENTS.indicatorColor,
      'informationBar.indicatorColor',
      context,
    ),
    noticeFontColor: readColor(
      bar,
      ELEMENTS.noticeFontColor,
      'informationBar.noticeFontColor',
      context,
    ),
    noticeGlowColor: readColor(
      bar,
      ELEMENTS.noticeGlowColor,
      'informationBar.noticeGlowColor',
      context,
    ),
    noNoticeIcon: readAssetPath(
      bar,
      ELEMENTS.noNoticeIconPath,
      'informationBar.noNoticeIcon',
      context,
    ),
    newNoticeIcon: readAssetPath(
      bar,
      ELEMENTS.newNoticeIconPath,
      'informationBar.newNoticeIcon',
      context,
    ),
  };
};

const readMetadata = (root: Element, context: FieldReadContext): ThemeMetadata => {
  const information = childElement(root, ELEMENTS.informationProperty);

  return {
    title: readLocalizedText(information, ELEMENTS.title),
    provider: readLocalizedText(information, ELEMENTS.provider),
    contentVersion: readContentVersion(information, 'metadata.contentVersion', context),
    homePreview: readAssetPath(
      information,
      ELEMENTS.homePreviewPath,
      'metadata.homePreview',
      context,
    ),
    startScreenPreview: readAssetPath(
      information,
      ELEMENTS.startScreenPreviewPath,
      'metadata.startScreenPreview',
      context,
    ),
    packageThumbnail: readAssetPath(
      information,
      ELEMENTS.packageThumbnailPath,
      'metadata.packageThumbnail',
      context,
    ),
    // A theme folder is somebody else's work: `theme.xml` has nowhere to record which
    // pictures a tool drew, so every preview in it is taken to be the author's own.
    generatedPreviews: new Set(),
  };
};

const readStartScreen = (root: Element, context: FieldReadContext): StartScreen => {
  const start = childElement(root, ELEMENTS.startScreenProperty);

  return {
    background: readAssetPath(
      start,
      ELEMENTS.startScreenBackgroundPath,
      'startScreen.background',
      context,
    ),
    dateColor: readColor(start, ELEMENTS.dateColor, 'startScreen.dateColor', context),
    dateLayout: readInteger(start, ELEMENTS.dateLayout, 'startScreen.dateLayout', context),
    notificationBackgroundColor: readColor(
      start,
      ELEMENTS.notificationBackgroundColor,
      'startScreen.notificationBackgroundColor',
      context,
    ),
    notificationBorderColor: readColor(
      start,
      ELEMENTS.notificationBorderColor,
      'startScreen.notificationBorderColor',
      context,
    ),
    notificationFontColor: readColor(
      start,
      ELEMENTS.notificationFontColor,
      'startScreen.notificationFontColor',
      context,
    ),
  };
};

const readFormatVersion = (root: Element, context: FieldReadContext): void => {
  const version = attributeText(root, THEME_XML_FORMAT_VERSION_ATTRIBUTE);
  if (version !== null && version !== '' && version !== THEME_XML_FORMAT_VERSION) {
    context.issues.push(
      validationWarning(
        VALIDATION_CODES.manifestUnexpectedFormatVersion,
        'theme',
        `The theme declares format version "${version}". Every known theme uses ` +
          `${THEME_XML_FORMAT_VERSION}, so it may not load as expected.`,
        { formatVersion: version },
      ),
    );
  }
};

/**
 * Parses the document, refusing anything that is not well-formed XML.
 *
 * The parser reports problems rather than throwing for all of them, and it will hand back a
 * partial document after an error, so the reported problems are collected and the document
 * is discarded if any of them is a genuine violation. Silently accepting a mistyped tag
 * would defeat the point of a validator.
 */
const parseDocument = (xml: string): Result<Element, ManifestParseError> => {
  const problems: string[] = [];

  let root: Element | null = null;
  try {
    const document = new DOMParser({
      onError: (level, message) => {
        if (level === 'error' || level === 'fatalError') {
          problems.push(message);
        }
      },
    }).parseFromString(xml, 'text/xml');
    root = document.documentElement;
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (problems.length > 0) {
    const [firstProblem] = problems;
    return failure({
      code: 'malformed-xml',
      message: `The theme manifest is not valid XML: ${firstProblem ?? 'the document could not be read'}`,
    });
  }

  return root === null
    ? failure({
        code: 'missing-root-element',
        message: 'The theme manifest is empty.',
      })
    : success(root);
};

export const parseThemeXml = (xml: string): Result<ParsedThemeManifest, ManifestParseError> => {
  if (DOCTYPE_DECLARATION.test(xml)) {
    return failure({
      code: 'malformed-xml',
      message:
        'The theme manifest contains a document type declaration, which theme files never ' +
        'use and which is unsafe to process. Remove it and try again.',
    });
  }

  const document = parseDocument(xml);
  if (!document.ok) {
    return document;
  }

  const root = document.value;
  if (root.nodeName !== THEME_XML_ROOT) {
    return failure({
      code: 'missing-root-element',
      message: `The manifest's root element is <${root.nodeName}>, not <${THEME_XML_ROOT}>, so it is not a PS Vita theme.`,
    });
  }

  const context: FieldReadContext = { issues: [] as ValidationIssue[] };
  readFormatVersion(root, context);

  const project: ThemeProject = {
    metadata: readMetadata(root, context),
    home: readHomeScreen(root, context),
    informationBar: readInformationBar(root, context),
    startScreen: readStartScreen(root, context),
  };

  return success({ project, issues: context.issues });
};
