import {
  INITIAL_CONTENT_VERSION,
  parseContentVersion,
  type ContentVersion,
} from '../../domain/model/content-version';
import { localizedText, type LocalizedText } from '../../domain/model/localized-text';
import { parseThemeAssetPath, type ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { parseThemeColor, type ThemeColor } from '../../domain/model/theme-color';
import {
  VALIDATION_CODES,
  validationError,
  type ValidationIssue,
} from '../../domain/validation/issue';
import { languageCodeFromParamTag, THEME_XML_ELEMENTS } from '../../domain/vita/theme-xml-schema';
import type { Element } from '@xmldom/xmldom';
import { childElement, childElementNames, childText } from './xml-dom';

/**
 * Converts individual `theme.xml` fields into domain values.
 *
 * An absent element is not an error: the console falls back to its own default and so does
 * the editor. A present but unusable value is reported and dropped, so one malformed colour
 * cannot stop the rest of the theme from loading.
 */
export interface FieldReadContext {
  readonly issues: ValidationIssue[];
}

const THEME_ASSET_PATH_PROBLEMS: Readonly<Record<string, string>> = {
  empty: 'the path is empty',
  'too-long': 'the path is too long',
  'control-characters': 'the path contains control characters',
  absolute: 'the path is absolute; theme assets must be relative to the theme folder',
  'backslash-separator': 'the path uses backslashes; use forward slashes',
  colon: 'the path contains a colon',
  'empty-segment': 'the path contains an empty folder name',
  'traversal-segment': 'the path escapes the theme folder',
  'reserved-device-name': 'the file name is reserved by Windows',
  'trailing-dot-or-space': 'a path segment ends with a dot or a space',
};

export const readAssetPath = (
  node: Element | null,
  tag: string,
  location: string,
  context: FieldReadContext,
): ThemeAssetPath | null => {
  const raw = childText(node, tag);
  if (raw === null) {
    return null;
  }

  const parsed = parseThemeAssetPath(raw);
  if (parsed.ok) {
    return parsed.value;
  }

  context.issues.push(
    validationError(
      VALIDATION_CODES.manifestUnsafeAssetPath,
      location,
      `The theme refers to "${raw}", which cannot be used as an asset path: ` +
        `${THEME_ASSET_PATH_PROBLEMS[parsed.error] ?? 'the path is not valid'}.`,
      { rawPath: raw, reason: parsed.error },
    ),
  );
  return null;
};

export const readColor = (
  node: Element | null,
  tag: string,
  location: string,
  context: FieldReadContext,
): ThemeColor | null => {
  const raw = childText(node, tag);
  if (raw === null) {
    return null;
  }

  const parsed = parseThemeColor(raw);
  if (parsed.ok) {
    return parsed.value;
  }

  context.issues.push(
    validationError(
      VALIDATION_CODES.manifestInvalidColor,
      location,
      `"${raw}" is not a valid colour. Use six hexadecimal digits (RRGGBB) or eight ` +
        'to include an alpha channel (AARRGGBB).',
      { rawValue: raw },
    ),
  );
  return null;
};

export const readInteger = (
  node: Element | null,
  tag: string,
  location: string,
  context: FieldReadContext,
): number | null => {
  const raw = childText(node, tag);
  if (raw === null) {
    return null;
  }

  // Parsed strictly: `Number.parseInt` would silently accept "24px" and "1.9".
  if (!/^-?\d+$/.test(raw)) {
    context.issues.push(
      validationError(
        VALIDATION_CODES.manifestInvalidNumber,
        location,
        `"${raw}" is not a whole number.`,
        { rawValue: raw },
      ),
    );
    return null;
  }

  return Number.parseInt(raw, 10);
};

export const readFlag = (
  node: Element | null,
  tag: string,
  location: string,
  context: FieldReadContext,
): boolean | null => {
  const raw = childText(node, tag);
  if (raw === null) {
    return null;
  }
  if (raw === '0' || raw === '1') {
    return raw === '1';
  }

  context.issues.push(
    validationError(
      VALIDATION_CODES.manifestInvalidBoolean,
      location,
      `"${raw}" is not a valid on/off value. Use 1 to enable or 0 to disable.`,
      { rawValue: raw },
    ),
  );
  return null;
};

export const readLocalizedText = (node: Element | null, tag: string): LocalizedText => {
  const field = childElement(node, tag);
  const defaultValue = childText(field, THEME_XML_ELEMENTS.localizedDefault) ?? '';

  const params = childElement(field, THEME_XML_ELEMENTS.localizedParams);
  const translations = new Map<string, string>();

  for (const key of childElementNames(params)) {
    const languageCode = languageCodeFromParamTag(key);
    const value = childText(params, key);
    if (languageCode !== null && value !== null) {
      translations.set(languageCode, value);
    }
  }

  return localizedText(defaultValue, translations);
};

export const readContentVersion = (
  node: Element | null,
  location: string,
  context: FieldReadContext,
): ContentVersion => {
  const raw = childText(node, THEME_XML_ELEMENTS.contentVersion);
  if (raw === null) {
    return INITIAL_CONTENT_VERSION;
  }

  const parsed = parseContentVersion(raw);
  if (parsed.ok) {
    return parsed.value;
  }

  // The console's XML parser rejects the whole theme over this field, so it is worth an
  // error even though the editor can carry on with a default.
  context.issues.push(
    validationError(
      VALIDATION_CODES.manifestInvalidContentVersion,
      location,
      `The theme version "${raw}" is not in the required NN.NN form, for example 01.00. ` +
        'The PS Vita refuses to load a theme whose version is written any other way.',
      { rawValue: raw },
    ),
  );
  return INITIAL_CONTENT_VERSION;
};
