/**
 * Language codes observed in the localisable fields of real themes (`m_title`, `m_provider`).
 *
 * Sony never published the accepted set, and the console falls back to the `m_default`
 * value for any language a theme does not translate. An unknown code is therefore carried
 * through untouched and only reported as a warning, so importing a theme that uses a code
 * we have not catalogued never loses data.
 */
export const OBSERVED_THEME_LANGUAGE_CODES = [
  'da',
  'de',
  'es',
  'fi',
  'fr',
  'it',
  'ja',
  'nl',
  'no',
  'pl',
  'pt',
  'ru',
  'sv',
] as const;

export type ObservedThemeLanguageCode = (typeof OBSERVED_THEME_LANGUAGE_CODES)[number];

const LANGUAGE_LABELS: Readonly<Record<ObservedThemeLanguageCode, string>> = {
  da: 'Danish',
  de: 'German',
  es: 'Spanish',
  fi: 'Finnish',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ru: 'Russian',
  sv: 'Swedish',
};

export const isObservedLanguageCode = (code: string): code is ObservedThemeLanguageCode =>
  Object.hasOwn(LANGUAGE_LABELS, code);

export const languageLabel = (code: string): string =>
  isObservedLanguageCode(code) ? LANGUAGE_LABELS[code] : code;
