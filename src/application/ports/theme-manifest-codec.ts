import type { Result } from '../../domain/shared/result';
import type { ThemeProject } from '../../domain/model/theme-project';
import type { ValidationIssue } from '../../domain/validation/issue';

/**
 * Reading `theme.xml` is a boundary: the file is untrusted and frequently hand-edited.
 * A recoverable problem, such as a malformed colour, yields an issue and a usable project
 * so the author can see and fix it in the editor. Only a document that cannot be
 * interpreted at all fails outright.
 */
export interface ParsedThemeManifest {
  readonly project: ThemeProject;
  readonly issues: readonly ValidationIssue[];
}

export type ManifestParseErrorCode = 'malformed-xml' | 'missing-root-element';

export interface ManifestParseError {
  readonly code: ManifestParseErrorCode;
  /** User-facing summary. Never carries a stack trace or an internal parser message. */
  readonly message: string;
}

export interface ThemeManifestCodec {
  parse(xml: string): Result<ParsedThemeManifest, ManifestParseError>;
  serialize(project: ThemeProject): string;
}
