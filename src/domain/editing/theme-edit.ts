import { parseContentVersion } from '../model/content-version';
import { localizedText, type LocalizedText } from '../model/localized-text';
import { emptyLiveAreaPage, type ThemeProject } from '../model/theme-project';
import { parseThemeColor, type ThemeColor } from '../model/theme-color';
import { failure, success, type Result } from '../shared/result';
import { allHomeAppSlots } from '../vita/home-app-slots';
import { MAX_LIVE_AREA_PAGES, MIN_LIVE_AREA_PAGES } from '../vita/live-area';
import { withAssetAtSlot, type ThemeAssetSlot } from './theme-asset-slot';

/**
 * Every way a theme can be changed.
 *
 * One named change at a time, applied by one function, so there is a single place where a
 * theme turns into a different theme. Each edit carries only plain values, which is what
 * lets the interface describe a change without holding a model of its own: it says what it
 * wants done, and is handed back the theme that resulted.
 *
 * This decides nothing about whether the result is a *good* theme. Values that cannot be
 * interpreted at all are refused here; everything else is the validator's answer to give,
 * because an editor has to be able to hold a theme that is not finished yet.
 */

export type ThemeColorSlot =
  | { readonly kind: 'bubbleFont'; readonly page: number }
  | { readonly kind: 'barColor' }
  | { readonly kind: 'indicatorColor' }
  | { readonly kind: 'noticeFontColor' }
  | { readonly kind: 'noticeGlowColor' }
  | { readonly kind: 'dateColor' }
  | { readonly kind: 'notificationBackgroundColor' }
  | { readonly kind: 'notificationBorderColor' }
  | { readonly kind: 'notificationFontColor' };

export type LocalizedField = 'title' | 'provider';

export type ThemeEdit =
  | {
      readonly kind: 'set-localized-default';
      readonly field: LocalizedField;
      readonly value: string;
    }
  | {
      readonly kind: 'set-translation';
      readonly field: LocalizedField;
      readonly language: string;
      /** `null` removes the translation, leaving the console to fall back to the default. */
      readonly value: string | null;
    }
  | { readonly kind: 'set-content-version'; readonly value: string }
  | { readonly kind: 'set-color'; readonly slot: ThemeColorSlot; readonly value: string | null }
  | { readonly kind: 'set-wave-type'; readonly page: number; readonly value: number | null }
  | { readonly kind: 'set-bubble-shadow'; readonly page: number; readonly value: boolean | null }
  | { readonly kind: 'set-date-layout'; readonly value: number | null }
  | { readonly kind: 'add-page' }
  | { readonly kind: 'remove-page'; readonly page: number }
  | { readonly kind: 'move-page'; readonly page: number; readonly to: number }
  | { readonly kind: 'clear-asset'; readonly slot: ThemeAssetSlot }
  /**
   * Takes every system icon out of the theme at once, so the console draws its own again.
   *
   * One change rather than seventeen: putting a set of icons back the way it was should not
   * mean pressing undo until something else moves. See `editing/system-icon-defaults`.
   */
  | { readonly kind: 'restore-system-icons' };

export type ThemeEditError =
  | 'unknown-page'
  | 'invalid-colour'
  | 'invalid-content-version'
  | 'invalid-language-code'
  | 'invalid-number'
  | 'too-many-pages'
  | 'last-page';

/**
 * A language code becomes an XML element name (`m_fr`), so it has to be one. This is the
 * format's constraint rather than a guess at which languages the console accepts — unknown
 * codes are kept and reported by the validator, not refused here.
 */
const LANGUAGE_CODE = /^[A-Za-z][A-Za-z0-9-]{0,7}$/;

const withLocalized = (
  text: LocalizedText,
  change: (translations: Map<string, string>) => void,
): LocalizedText => {
  const translations = new Map(text.translations);
  change(translations);
  return localizedText(text.defaultValue, translations);
};

const localizedFieldOf = (project: ThemeProject, field: LocalizedField): LocalizedText =>
  field === 'title' ? project.metadata.title : project.metadata.provider;

const withLocalizedField = (
  project: ThemeProject,
  field: LocalizedField,
  value: LocalizedText,
): ThemeProject => ({
  ...project,
  metadata:
    field === 'title'
      ? { ...project.metadata, title: value }
      : { ...project.metadata, provider: value },
});

const withColor = (
  project: ThemeProject,
  slot: ThemeColorSlot,
  color: ThemeColor | null,
): Result<ThemeProject, ThemeEditError> => {
  const { informationBar, startScreen } = project;

  switch (slot.kind) {
    case 'bubbleFont': {
      if (project.home.pages[slot.page] === undefined) {
        return failure('unknown-page');
      }
      return success({
        ...project,
        home: {
          ...project.home,
          pages: project.home.pages.map((page, index) =>
            index === slot.page ? { ...page, bubbleFontColor: color } : page,
          ),
        },
      });
    }
    case 'barColor':
      return success({ ...project, informationBar: { ...informationBar, barColor: color } });
    case 'indicatorColor':
      return success({ ...project, informationBar: { ...informationBar, indicatorColor: color } });
    case 'noticeFontColor':
      return success({ ...project, informationBar: { ...informationBar, noticeFontColor: color } });
    case 'noticeGlowColor':
      return success({ ...project, informationBar: { ...informationBar, noticeGlowColor: color } });
    case 'dateColor':
      return success({ ...project, startScreen: { ...startScreen, dateColor: color } });
    case 'notificationBackgroundColor':
      return success({
        ...project,
        startScreen: { ...startScreen, notificationBackgroundColor: color },
      });
    case 'notificationBorderColor':
      return success({
        ...project,
        startScreen: { ...startScreen, notificationBorderColor: color },
      });
    case 'notificationFontColor':
      return success({ ...project, startScreen: { ...startScreen, notificationFontColor: color } });
  }
};

const withPageValue = (
  project: ThemeProject,
  page: number,
  change: (current: ThemeProject['home']['pages'][number]) => ThemeProject['home']['pages'][number],
): Result<ThemeProject, ThemeEditError> => {
  if (project.home.pages[page] === undefined) {
    return failure('unknown-page');
  }

  return success({
    ...project,
    home: {
      ...project.home,
      pages: project.home.pages.map((candidate, index) =>
        index === page ? change(candidate) : candidate,
      ),
    },
  });
};

const withPages = (
  project: ThemeProject,
  pages: readonly ThemeProject['home']['pages'][number][],
): ThemeProject => ({ ...project, home: { ...project.home, pages } });

const isWholeNumber = (value: number): boolean => Number.isInteger(value);

export const applyThemeEdit = (
  project: ThemeProject,
  edit: ThemeEdit,
): Result<ThemeProject, ThemeEditError> => {
  switch (edit.kind) {
    case 'set-localized-default': {
      const current = localizedFieldOf(project, edit.field);
      return success(
        withLocalizedField(project, edit.field, localizedText(edit.value, current.translations)),
      );
    }

    case 'set-translation': {
      if (!LANGUAGE_CODE.test(edit.language)) {
        return failure('invalid-language-code');
      }

      const { value } = edit;
      const updated = withLocalized(localizedFieldOf(project, edit.field), (translations) => {
        if (value === null) {
          translations.delete(edit.language);
        } else {
          translations.set(edit.language, value);
        }
      });

      return success(withLocalizedField(project, edit.field, updated));
    }

    case 'set-content-version': {
      const parsed = parseContentVersion(edit.value);
      return parsed.ok
        ? success({ ...project, metadata: { ...project.metadata, contentVersion: parsed.value } })
        : failure('invalid-content-version');
    }

    case 'set-color': {
      if (edit.value === null) {
        return withColor(project, edit.slot, null);
      }

      const parsed = parseThemeColor(edit.value);
      return parsed.ok ? withColor(project, edit.slot, parsed.value) : failure('invalid-colour');
    }

    case 'set-wave-type': {
      if (edit.value !== null && !isWholeNumber(edit.value)) {
        return failure('invalid-number');
      }
      return withPageValue(project, edit.page, (page) => ({ ...page, waveType: edit.value }));
    }

    case 'set-bubble-shadow':
      return withPageValue(project, edit.page, (page) => ({
        ...page,
        bubbleFontShadow: edit.value,
      }));

    case 'set-date-layout': {
      if (edit.value !== null && !isWholeNumber(edit.value)) {
        return failure('invalid-number');
      }
      return success({
        ...project,
        startScreen: { ...project.startScreen, dateLayout: edit.value },
      });
    }

    case 'add-page':
      return project.home.pages.length >= MAX_LIVE_AREA_PAGES
        ? failure('too-many-pages')
        : success(withPages(project, [...project.home.pages, emptyLiveAreaPage()]));

    case 'remove-page': {
      if (project.home.pages[edit.page] === undefined) {
        return failure('unknown-page');
      }
      // A theme that styles no page is not a theme; the console would keep its own home screen.
      if (project.home.pages.length <= MIN_LIVE_AREA_PAGES) {
        return failure('last-page');
      }

      return success(
        withPages(
          project,
          project.home.pages.filter((_page, index) => index !== edit.page),
        ),
      );
    }

    case 'move-page': {
      const { pages } = project.home;
      const moved = pages[edit.page];
      if (moved === undefined || pages[edit.to] === undefined) {
        return failure('unknown-page');
      }

      const remaining = pages.filter((_page, index) => index !== edit.page);
      return success(
        withPages(project, [...remaining.slice(0, edit.to), moved, ...remaining.slice(edit.to)]),
      );
    }

    case 'clear-asset':
      return success(withAssetAtSlot(project, edit.slot, null));

    case 'restore-system-icons':
      return success(
        allHomeAppSlots().reduce(
          (carried, slot) =>
            withAssetAtSlot(carried, { kind: 'appIcon', application: slot.id }, null),
          project,
        ),
      );
  }
};
