import { failure, success, type Result } from '../shared/result';

/**
 * Value of `m_contentVer`.
 *
 * The console's XML parser rejects the whole theme unless this field is exactly two digits,
 * a dot and two digits, so the constraint is enforced in the type rather than left to the
 * validator.
 */
export interface ContentVersion {
  readonly major: number;
  readonly minor: number;
}

export type ContentVersionParseError = 'empty' | 'malformed';

const CONTENT_VERSION = /^(\d{2})\.(\d{2})$/;
const MAX_COMPONENT = 99;

export const parseContentVersion = (
  raw: string,
): Result<ContentVersion, ContentVersionParseError> => {
  const text = raw.trim();
  if (text.length === 0) {
    return failure('empty');
  }

  const matched = CONTENT_VERSION.exec(text);
  if (matched === null) {
    return failure('malformed');
  }

  return success({
    major: Number.parseInt(matched[1] ?? '', 10),
    minor: Number.parseInt(matched[2] ?? '', 10),
  });
};

export const formatContentVersion = (version: ContentVersion): string =>
  `${String(version.major).padStart(2, '0')}.${String(version.minor).padStart(2, '0')}`;

export const contentVersion = (
  major: number,
  minor: number,
): Result<ContentVersion, ContentVersionParseError> => {
  const withinRange = (value: number): boolean =>
    Number.isInteger(value) && value >= 0 && value <= MAX_COMPONENT;

  return withinRange(major) && withinRange(minor)
    ? success({ major, minor })
    : failure('malformed');
};

export const INITIAL_CONTENT_VERSION: ContentVersion = { major: 1, minor: 0 };
