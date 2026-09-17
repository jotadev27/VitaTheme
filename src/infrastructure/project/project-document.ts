import type {
  ProjectDocumentCodec,
  ProjectDocumentError,
  ProjectDocumentErrorCode,
} from '../../application/ports/project-document-codec';
import {
  formatContentVersion,
  parseContentVersion,
  type ContentVersion,
} from '../../domain/model/content-version';
import { localizedText, type LocalizedText } from '../../domain/model/localized-text';
import { parseThemeAssetPath, type ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { formatThemeColor, parseThemeColor, type ThemeColor } from '../../domain/model/theme-color';
import type {
  HomeScreen,
  InformationBar,
  LiveAreaPage,
  StartScreen,
  ThemeMetadata,
  ThemeProject,
} from '../../domain/model/theme-project';
import { failure, success, type Result } from '../../domain/shared/result';
import { HOME_APP_SLOT_IDS, type HomeAppSlotId } from '../../domain/vita/home-app-slots';
import {
  isThemePreviewKind,
  THEME_PREVIEW_KINDS,
  type ThemePreviewKind,
} from '../../domain/vita/theme-previews';

/**
 * The `.vitatheme` project document.
 *
 * JSON, and shaped like the theme it describes rather than like anything the console reads:
 * a project is what is being worked on, and the PS Vita theme is what an export produces
 * from it. Keeping the two apart is why this file exists at all — the manifest codec writes
 * what the console expects, and this writes what the editor needs to carry on tomorrow.
 *
 * Only canonical state is written. Everything else the interface shows — which files are
 * present, what they turn out to be, whether the theme would pass validation — is worked out
 * again when the project is opened, because it describes the machine at a moment rather than
 * the theme itself.
 *
 * Every value is written in the same notation the theme itself uses: colours exactly as the
 * author wrote them, the content version as two digits and two digits, file references as
 * names relative to the project. Reading them back goes through the very same parsers a
 * theme's own `theme.xml` goes through, so a project file gets no weaker a check than a
 * theme downloaded from a stranger.
 */

const FORMAT = 'vitatheme';

/**
 * The version of this document format.
 *
 * A document from a later version is refused rather than guessed at: the fields this
 * version does not know about would be dropped silently, and a save would then write back a
 * project with somebody's work missing from it.
 */
const VERSION = 1;

/** Long enough for any theme name or author, short enough that a document stays a document. */
const MAX_TEXT_LENGTH = 1000;
const MAX_LANGUAGE_CODE_LENGTH = 32;
const MAX_TRANSLATIONS = 64;

/**
 * A bound on the page list, far above the ten the console has.
 *
 * It is not the format's rule — the validator reports a theme with too many pages, and an
 * imported theme keeps whatever it had so nothing is lost by opening it here. This exists
 * only so that a document claiming a million pages is refused before it is built.
 */
const MAX_PAGES = 100;

/** Conservative: what a language code looks like, rather than any key at all. */
const LANGUAGE_CODE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Names that mean something to an object rather than naming a value in it.
 *
 * Translations are read into a `Map`, which cannot be reached through a prototype, and are
 * written back with `Object.fromEntries`, which defines properties rather than assigning
 * them. Neither would be affected by one of these. They are refused anyway, because a
 * document that contains one is not a project somebody wrote, and the next person to read
 * this code should not have to work out whether it is dangerous.
 */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface LocalizedTextDocument {
  readonly default: string;
  readonly translations: Record<string, string>;
}

/**
 * Refusal, raised where the problem is and turned into a failure at the one place this
 * module is entered.
 *
 * Validation elsewhere in the application accumulates problems, because a theme with six
 * mistakes in it is something an author needs to see all of. A project document is written
 * by this application: one wrong field means the file is damaged or is not what it claims to
 * be, and there is nothing further to learn by reading the rest of it.
 */
class InvalidProjectDocument extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = 'InvalidProjectDocument';
  }
}

const invalid = (detail: string): never => {
  throw new InvalidProjectDocument(detail);
};

const asObject = (value: unknown, at: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid(`${at} is not an object`);

const asText = (value: unknown, at: string, limit = MAX_TEXT_LENGTH): string => {
  if (typeof value !== 'string') {
    return invalid(`${at} is not text`);
  }
  return value.length <= limit ? value : invalid(`${at} is longer than a theme can hold`);
};

const asOptional = <TValue>(
  value: unknown,
  at: string,
  read: (present: unknown, at: string) => TValue,
): TValue | null => (value === null ? null : read(value, at));

const asAssetPath = (value: unknown, at: string): ThemeAssetPath => {
  const parsed = parseThemeAssetPath(asText(value, at));
  return parsed.ok ? parsed.value : invalid(`${at} is not a name a theme can refer to`);
};

const asColor = (value: unknown, at: string): ThemeColor => {
  const parsed = parseThemeColor(asText(value, at));
  return parsed.ok ? parsed.value : invalid(`${at} is not a colour`);
};

const asWholeNumber = (value: unknown, at: string): number =>
  typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : invalid(`${at} is not a whole number`);

const asFlag = (value: unknown, at: string): boolean =>
  typeof value === 'boolean' ? value : invalid(`${at} is not true or false`);

const asArray = (value: unknown, at: string, limit: number): readonly unknown[] => {
  if (!Array.isArray(value)) {
    return invalid(`${at} is not a list`);
  }
  return value.length <= limit ? value : invalid(`${at} holds more entries than a theme can`);
};

const asContentVersion = (value: unknown, at: string): ContentVersion => {
  const parsed = parseContentVersion(asText(value, at, MAX_LANGUAGE_CODE_LENGTH));
  return parsed.ok ? parsed.value : invalid(`${at} is not a theme version`);
};

const localizedTextDocument = (text: LocalizedText): LocalizedTextDocument => ({
  default: text.defaultValue,
  translations: Object.fromEntries(
    [...text.translations].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  ),
});

const readLocalizedText = (value: unknown, at: string): LocalizedText => {
  const document = asObject(value, at);
  const translations = asObject(document.translations, `${at}.translations`);
  const entries = Object.entries(translations);

  if (entries.length > MAX_TRANSLATIONS) {
    invalid(`${at}.translations holds more languages than a theme can`);
  }

  return localizedText(
    asText(document.default, `${at}.default`),
    new Map(
      entries.map(([code, translated]) => {
        if (
          PROTOTYPE_KEYS.has(code) ||
          code.length > MAX_LANGUAGE_CODE_LENGTH ||
          !LANGUAGE_CODE.test(code)
        ) {
          invalid(`${at}.translations names "${code}", which is not a language code`);
        }
        return [code, asText(translated, `${at}.translations.${code}`)] as const;
      }),
    ),
  );
};

const pageDocument = (page: LiveAreaPage) => ({
  background: page.background,
  thumbnail: page.thumbnail,
  generatedThumbnail: page.generatedThumbnail,
  waveType: page.waveType,
  bubbleFontColor: page.bubbleFontColor === null ? null : formatThemeColor(page.bubbleFontColor),
  bubbleFontShadow: page.bubbleFontShadow,
});

const readPage = (value: unknown, at: string): LiveAreaPage => {
  const page = asObject(value, at);

  return {
    background: asOptional(page.background, `${at}.background`, asAssetPath),
    thumbnail: asOptional(page.thumbnail, `${at}.thumbnail`, asAssetPath),
    // Older projects have no provenance record; their existing artwork belongs to the author.
    generatedThumbnail:
      page.generatedThumbnail === undefined
        ? false
        : asFlag(page.generatedThumbnail, `${at}.generatedThumbnail`),
    waveType: asOptional(page.waveType, `${at}.waveType`, asWholeNumber),
    bubbleFontColor: asOptional(page.bubbleFontColor, `${at}.bubbleFontColor`, asColor),
    bubbleFontShadow: asOptional(page.bubbleFontShadow, `${at}.bubbleFontShadow`, asFlag),
  };
};

/** Written in the order the format lists the applications, so two saves agree byte for byte. */
const appIconsDocument = (icons: ReadonlyMap<HomeAppSlotId, ThemeAssetPath>) =>
  Object.fromEntries(
    HOME_APP_SLOT_IDS.flatMap((id) => {
      const path = icons.get(id);
      return path === undefined ? [] : [[id, path] as const];
    }),
  );

const readAppIcons = (value: unknown, at: string): ReadonlyMap<HomeAppSlotId, ThemeAssetPath> => {
  const icons = asObject(value, at);

  return new Map(
    Object.entries(icons).map(([id, path]) => {
      // An unknown name is refused rather than dropped: a project must not come back from
      // disk quietly missing something that was in it.
      if (!HOME_APP_SLOT_IDS.includes(id as HomeAppSlotId)) {
        invalid(`${at} names "${id}", which is not an application a theme can give an icon`);
      }
      return [id as HomeAppSlotId, asAssetPath(path, `${at}.${id}`)] as const;
    }),
  );
};

/**
 * Which previews the application drew.
 *
 * Written in the format layer's order rather than in insertion order, so that a project
 * saved twice is the same file both times — which is what makes comparing the document with
 * what was last written a sound way to tell whether there is unsaved work.
 */
const generatedPreviewsDocument = (kinds: ReadonlySet<ThemePreviewKind>): readonly string[] =>
  THEME_PREVIEW_KINDS.filter((kind) => kinds.has(kind));

const readGeneratedPreviews = (value: unknown, at: string): ReadonlySet<ThemePreviewKind> => {
  // Absent in every project written before previews could be generated. Those documents are
  // still valid: nothing in them was drawn by the application.
  if (value === undefined || value === null) {
    return new Set();
  }

  return new Set(
    asArray(value, at, THEME_PREVIEW_KINDS.length).map((entry, index) => {
      const kind = asText(entry, `${at}[${String(index)}]`, MAX_LANGUAGE_CODE_LENGTH);
      return isThemePreviewKind(kind)
        ? kind
        : invalid(`${at} names "${kind}", which is not a preview a theme has`);
    }),
  );
};

const metadataDocument = (metadata: ThemeMetadata) => ({
  title: localizedTextDocument(metadata.title),
  provider: localizedTextDocument(metadata.provider),
  contentVersion: formatContentVersion(metadata.contentVersion),
  homePreview: metadata.homePreview,
  startScreenPreview: metadata.startScreenPreview,
  packageThumbnail: metadata.packageThumbnail,
  generatedPreviews: generatedPreviewsDocument(metadata.generatedPreviews),
});

const readMetadata = (value: unknown, at: string): ThemeMetadata => {
  const metadata = asObject(value, at);

  return {
    title: readLocalizedText(metadata.title, `${at}.title`),
    provider: readLocalizedText(metadata.provider, `${at}.provider`),
    contentVersion: asContentVersion(metadata.contentVersion, `${at}.contentVersion`),
    homePreview: asOptional(metadata.homePreview, `${at}.homePreview`, asAssetPath),
    startScreenPreview: asOptional(
      metadata.startScreenPreview,
      `${at}.startScreenPreview`,
      asAssetPath,
    ),
    packageThumbnail: asOptional(metadata.packageThumbnail, `${at}.packageThumbnail`, asAssetPath),
    generatedPreviews: readGeneratedPreviews(metadata.generatedPreviews, `${at}.generatedPreviews`),
  };
};

const homeDocument = (home: HomeScreen) => ({
  pages: home.pages.map(pageDocument),
  backgroundMusic: home.backgroundMusic,
  appIcons: appIconsDocument(home.appIcons),
  basePageIndicator: home.basePageIndicator,
  currentPageIndicator: home.currentPageIndicator,
});

const readHome = (value: unknown, at: string): HomeScreen => {
  const home = asObject(value, at);

  return {
    pages: asArray(home.pages, `${at}.pages`, MAX_PAGES).map((page, index) =>
      readPage(page, `${at}.pages[${String(index)}]`),
    ),
    backgroundMusic: asOptional(home.backgroundMusic, `${at}.backgroundMusic`, asAssetPath),
    appIcons: readAppIcons(home.appIcons, `${at}.appIcons`),
    basePageIndicator: asOptional(home.basePageIndicator, `${at}.basePageIndicator`, asAssetPath),
    currentPageIndicator: asOptional(
      home.currentPageIndicator,
      `${at}.currentPageIndicator`,
      asAssetPath,
    ),
  };
};

const colorOrNull = (color: ThemeColor | null): string | null =>
  color === null ? null : formatThemeColor(color);

const informationBarDocument = (bar: InformationBar) => ({
  barColor: colorOrNull(bar.barColor),
  indicatorColor: colorOrNull(bar.indicatorColor),
  noticeFontColor: colorOrNull(bar.noticeFontColor),
  noticeGlowColor: colorOrNull(bar.noticeGlowColor),
  noNoticeIcon: bar.noNoticeIcon,
  newNoticeIcon: bar.newNoticeIcon,
});

const readInformationBar = (value: unknown, at: string): InformationBar => {
  const bar = asObject(value, at);

  return {
    barColor: asOptional(bar.barColor, `${at}.barColor`, asColor),
    indicatorColor: asOptional(bar.indicatorColor, `${at}.indicatorColor`, asColor),
    noticeFontColor: asOptional(bar.noticeFontColor, `${at}.noticeFontColor`, asColor),
    noticeGlowColor: asOptional(bar.noticeGlowColor, `${at}.noticeGlowColor`, asColor),
    noNoticeIcon: asOptional(bar.noNoticeIcon, `${at}.noNoticeIcon`, asAssetPath),
    newNoticeIcon: asOptional(bar.newNoticeIcon, `${at}.newNoticeIcon`, asAssetPath),
  };
};

const startScreenDocument = (screen: StartScreen) => ({
  background: screen.background,
  dateColor: colorOrNull(screen.dateColor),
  dateLayout: screen.dateLayout,
  notificationBackgroundColor: colorOrNull(screen.notificationBackgroundColor),
  notificationBorderColor: colorOrNull(screen.notificationBorderColor),
  notificationFontColor: colorOrNull(screen.notificationFontColor),
});

const readStartScreen = (value: unknown, at: string): StartScreen => {
  const screen = asObject(value, at);

  return {
    background: asOptional(screen.background, `${at}.background`, asAssetPath),
    dateColor: asOptional(screen.dateColor, `${at}.dateColor`, asColor),
    dateLayout: asOptional(screen.dateLayout, `${at}.dateLayout`, asWholeNumber),
    notificationBackgroundColor: asOptional(
      screen.notificationBackgroundColor,
      `${at}.notificationBackgroundColor`,
      asColor,
    ),
    notificationBorderColor: asOptional(
      screen.notificationBorderColor,
      `${at}.notificationBorderColor`,
      asColor,
    ),
    notificationFontColor: asOptional(
      screen.notificationFontColor,
      `${at}.notificationFontColor`,
      asColor,
    ),
  };
};

const documentError = (
  code: ProjectDocumentErrorCode,
  message: string,
): Result<never, ProjectDocumentError> => failure({ code, message });

/**
 * Reads the two fields that decide whether the rest is worth reading.
 *
 * A file that does not say it is a VitaTheme project is not treated as a damaged one: the
 * person most likely chose the wrong file, and saying so is more useful than describing a
 * field they have never heard of.
 */
const readEnvelope = (value: unknown): Result<Record<string, unknown>, ProjectDocumentError> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return documentError('malformed', 'That file does not hold a VitaTheme project.');
  }

  const document = value as Record<string, unknown>;
  if (document.format !== FORMAT) {
    return documentError('not-a-project', 'That file is not a VitaTheme project.');
  }

  const version = document.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return documentError('malformed', 'The project file does not say which version it is.');
  }

  if (version > VERSION) {
    return documentError(
      'unsupported-version',
      'That project was made by a newer version of VitaTheme. Update VitaTheme to open it.',
    );
  }

  return success(document);
};

export const projectDocumentCodec = (): ProjectDocumentCodec => ({
  serialize: (project) =>
    `${JSON.stringify(
      {
        format: FORMAT,
        version: VERSION,
        theme: {
          metadata: metadataDocument(project.metadata),
          home: homeDocument(project.home),
          informationBar: informationBarDocument(project.informationBar),
          startScreen: startScreenDocument(project.startScreen),
        },
      },
      null,
      2,
    )}\n`,

  parse: (text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return documentError('malformed', 'The project file is damaged and could not be read.');
    }

    const envelope = readEnvelope(parsed);
    if (!envelope.ok) {
      return envelope;
    }

    try {
      const theme = asObject(envelope.value.theme, 'the project');
      const project: ThemeProject = {
        metadata: readMetadata(theme.metadata, 'metadata'),
        home: readHome(theme.home, 'home'),
        informationBar: readInformationBar(theme.informationBar, 'informationBar'),
        startScreen: readStartScreen(theme.startScreen, 'startScreen'),
      };

      return success(project);
    } catch (error) {
      if (error instanceof InvalidProjectDocument) {
        return documentError(
          'invalid-content',
          `The project file could not be read: ${error.detail}.`,
        );
      }
      throw error;
    }
  },
});
