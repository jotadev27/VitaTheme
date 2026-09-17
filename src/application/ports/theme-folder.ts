import type { Result } from '../../domain/shared/result';
import type { ThemeAssetSource } from './theme-assets';

export type ThemeFolderErrorCode =
  'not-found' | 'not-a-directory' | 'manifest-missing' | 'unreadable';

export interface ThemeFolderError {
  readonly code: ThemeFolderErrorCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

/**
 * Read access to a theme laid out as a folder, the form the console and the community
 * theme managers use: a manifest, plus the files it references. Implementations are
 * responsible for confining every access to the theme root.
 */
export interface ThemeFolder extends ThemeAssetSource {
  readManifest(): Promise<Result<string, ThemeFolderError>>;
}
