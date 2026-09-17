/**
 * A theme field that can be translated (`m_title`, `m_provider`).
 *
 * `defaultValue` is what the console shows for any language the theme does not translate.
 * Unknown language codes are kept as written so importing and re-exporting a theme never
 * drops a translation the application does not recognise.
 */
export interface LocalizedText {
  readonly defaultValue: string;
  readonly translations: ReadonlyMap<string, string>;
}

export const localizedText = (
  defaultValue: string,
  translations: ReadonlyMap<string, string> = new Map(),
): LocalizedText => ({ defaultValue, translations: new Map(translations) });

/** Builds a field translated identically in every language, the common case for a theme name. */
export const uniformLocalizedText = (
  value: string,
  languageCodes: readonly string[],
): LocalizedText =>
  localizedText(value, new Map(languageCodes.map((code) => [code, value] as const)));

export const resolveLocalizedText = (text: LocalizedText, languageCode: string): string =>
  text.translations.get(languageCode) ?? text.defaultValue;

export const withTranslation = (
  text: LocalizedText,
  languageCode: string,
  value: string,
): LocalizedText => {
  const translations = new Map(text.translations);
  translations.set(languageCode, value);
  return { defaultValue: text.defaultValue, translations };
};
