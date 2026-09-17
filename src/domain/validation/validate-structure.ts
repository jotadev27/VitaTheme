import type { LocalizedText } from '../model/localized-text';
import type {
  HomeScreen,
  InformationBar,
  StartScreen,
  ThemeMetadata,
  ThemeProject,
} from '../model/theme-project';
import { HOME_APP_SLOT_IDS, homeAppSlot } from '../vita/home-app-slots';
import { isObservedLanguageCode } from '../vita/languages';
import { MAX_LIVE_AREA_PAGES } from '../vita/live-area';
import { DATE_LAYOUT_OPTIONS, isDocumentedDateLayout } from '../vita/start-screen';
import {
  VALIDATION_CODES,
  validationError,
  validationWarning,
  type ValidationIssue,
} from './issue';

const isBlank = (value: string): boolean => value.trim().length === 0;

const validateLocalizedText = (
  text: LocalizedText,
  location: string,
  fieldLabel: string,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  for (const [languageCode, translation] of text.translations) {
    if (!isObservedLanguageCode(languageCode)) {
      issues.push(
        validationWarning(
          VALIDATION_CODES.metadataUnknownLanguageCode,
          `${location}.translations.${languageCode}`,
          `The ${fieldLabel} is translated into "${languageCode}", which is not a language ` +
            'code seen in other themes. It is kept as written, but the console may ignore it.',
          { languageCode },
        ),
      );
    }

    if (isBlank(translation)) {
      issues.push(
        validationWarning(
          VALIDATION_CODES.metadataTranslationEmpty,
          `${location}.translations.${languageCode}`,
          `The ${fieldLabel} translation for "${languageCode}" is empty. Remove it so the ` +
            'console falls back to the default value instead of showing nothing.',
          { languageCode },
        ),
      );
    }
  }

  return issues;
};

const validateMetadata = (metadata: ThemeMetadata): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (isBlank(metadata.title.defaultValue)) {
    issues.push(
      validationError(
        VALIDATION_CODES.metadataTitleEmpty,
        'metadata.title',
        'The theme needs a name. It is what the console shows in the theme list.',
      ),
    );
  }

  if (isBlank(metadata.provider.defaultValue)) {
    issues.push(
      validationWarning(
        VALIDATION_CODES.metadataProviderEmpty,
        'metadata.provider',
        'The theme has no author. The console shows this next to the theme name.',
      ),
    );
  }

  issues.push(...validateLocalizedText(metadata.title, 'metadata.title', 'theme name'));
  issues.push(...validateLocalizedText(metadata.provider, 'metadata.provider', 'author'));

  const previews = [
    { value: metadata.homePreview, location: 'metadata.homePreview', label: 'home screen preview' },
    {
      value: metadata.startScreenPreview,
      location: 'metadata.startScreenPreview',
      label: 'start screen preview',
    },
    {
      value: metadata.packageThumbnail,
      location: 'metadata.packageThumbnail',
      label: 'theme thumbnail',
    },
  ];

  for (const preview of previews) {
    if (preview.value === null) {
      issues.push(
        validationWarning(
          VALIDATION_CODES.metadataPreviewMissing,
          preview.location,
          `The theme has no ${preview.label}. The console shows a blank entry when browsing themes.`,
        ),
      );
    }
  }

  return issues;
};

const validateHome = (home: HomeScreen): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (home.pages.length === 0) {
    issues.push(
      validationError(
        VALIDATION_CODES.homeNoPages,
        'home.pages',
        'The theme styles no LiveArea page. Add at least one page background.',
      ),
    );
  }

  if (home.pages.length > MAX_LIVE_AREA_PAGES) {
    issues.push(
      validationError(
        VALIDATION_CODES.homeTooManyPages,
        'home.pages',
        `The theme defines ${String(home.pages.length)} LiveArea pages, but the PS Vita has ` +
          `only ${String(MAX_LIVE_AREA_PAGES)}.`,
        { maxPages: MAX_LIVE_AREA_PAGES, actualPages: home.pages.length },
      ),
    );
  }

  home.pages.forEach((page, index) => {
    const location = `home.pages[${String(index)}]`;
    const pageNumber = String(index + 1);

    if (page.background === null) {
      issues.push(
        validationWarning(
          VALIDATION_CODES.homePageBackgroundMissing,
          `${location}.background`,
          `LiveArea page ${pageNumber} has no background image, so it keeps the stock ` +
            'animated wave background.',
        ),
      );
    } else if (page.thumbnail === null) {
      issues.push(
        validationWarning(
          VALIDATION_CODES.homePageThumbnailMissing,
          `${location}.thumbnail`,
          `LiveArea page ${pageNumber} has a background but no thumbnail, so it appears ` +
            'blank when browsing wallpapers.',
        ),
      );
    }
  });

  const missingIcons = HOME_APP_SLOT_IDS.filter((slotId) => !home.appIcons.has(slotId));
  if (missingIcons.length > 0 && missingIcons.length < HOME_APP_SLOT_IDS.length) {
    issues.push(
      validationWarning(
        VALIDATION_CODES.homeIconSetIncomplete,
        'home.appIcons',
        `${String(missingIcons.length)} of ${String(HOME_APP_SLOT_IDS.length)} system icons ` +
          'are not themed, so they keep their stock appearance: ' +
          `${missingIcons.map((slotId) => homeAppSlot(slotId).label).join(', ')}.`,
        { missingCount: missingIcons.length, totalCount: HOME_APP_SLOT_IDS.length },
      ),
    );
  }

  const indicatorsSet = [home.basePageIndicator, home.currentPageIndicator].filter(
    (indicator) => indicator !== null,
  ).length;
  if (indicatorsSet === 1) {
    issues.push(
      validationWarning(
        VALIDATION_CODES.homePageIndicatorIncomplete,
        'home.basePageIndicator',
        'Only one of the two page indicator dots is themed. The selected and unselected ' +
          'dots will not match.',
      ),
    );
  }

  return issues;
};

const validateInformationBar = (informationBar: InformationBar): ValidationIssue[] => {
  const badgesSet = [informationBar.noNoticeIcon, informationBar.newNoticeIcon].filter(
    (badge) => badge !== null,
  ).length;

  return badgesSet === 1
    ? [
        validationWarning(
          VALIDATION_CODES.informationBarBadgeIncomplete,
          'informationBar.noNoticeIcon',
          'Only one of the two notification badges is themed. The badge will change ' +
            'appearance when a notification arrives.',
        ),
      ]
    : [];
};

const validateStartScreen = (startScreen: StartScreen): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (startScreen.background === null) {
    issues.push(
      validationWarning(
        VALIDATION_CODES.startScreenBackgroundMissing,
        'startScreen.background',
        'The start screen has no background image, so the lock screen keeps the stock wallpaper.',
      ),
    );
  }

  if (startScreen.dateLayout !== null && !isDocumentedDateLayout(startScreen.dateLayout)) {
    const documented = DATE_LAYOUT_OPTIONS.map(
      (option) => `${String(option.value)} (${option.label.toLowerCase()})`,
    ).join(', ');

    issues.push(
      validationWarning(
        VALIDATION_CODES.startScreenUnknownDateLayout,
        'startScreen.dateLayout',
        `Clock position ${String(startScreen.dateLayout)} is not a documented value. ` +
          `Known values are ${documented}.`,
        { dateLayout: startScreen.dateLayout },
      ),
    );
  }

  return issues;
};

export const validateStructure = (project: ThemeProject): readonly ValidationIssue[] => [
  ...validateMetadata(project.metadata),
  ...validateHome(project.home),
  ...validateInformationBar(project.informationBar),
  ...validateStartScreen(project.startScreen),
];
