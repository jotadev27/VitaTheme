import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import type { Result } from '../../domain/shared/result';

export type ThemeExportFailureCode =
  /** Something is already at the destination and the caller did not ask to replace it. */
  | 'destination-exists'
  /** The destination cannot hold an export: its parent is missing, or it is the wrong kind. */
  | 'destination-invalid'
  | 'destination-unwritable'
  /** The theme references a file that is no longer there. */
  | 'asset-missing'
  | 'asset-unreadable'
  | 'asset-too-large'
  /** A path in the theme could escape the export, or cannot exist on some system. */
  | 'unsafe-asset-path'
  /** Two fields resolved to the same file inside the export, which would lose one of them. */
  | 'duplicate-file'
  /** The theme exceeds what the ZIP format can describe without ZIP64. */
  | 'archive-too-large'
  | 'write-failed';

export interface ThemeExportFailure {
  readonly code: ThemeExportFailureCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
  /** The asset the failure is about, relative to the theme root, when there is one. */
  readonly assetPath?: ThemeAssetPath;
}

export const themeExportFailure = (
  code: ThemeExportFailureCode,
  message: string,
  assetPath?: ThemeAssetPath,
): ThemeExportFailure =>
  assetPath === undefined ? { code, message } : { code, message, assetPath };

/**
 * Somewhere a theme can be written: a folder, a ZIP archive, or anything else that can hold
 * the manifest and the files it references.
 *
 * An implementation writes to a staging location and publishes it only on `commit`, so a
 * failed export never leaves a half-written theme behind. The use case owns the target once
 * it is handed one: it always ends with either `commit` or `discard`.
 *
 * The layout of a theme is fixed by the format, so it belongs to the target rather than to
 * the caller: the manifest is always `theme.xml` at the theme root, and every asset keeps
 * the path the manifest refers to it by.
 */
export interface ThemeExportTarget {
  writeManifest(contents: Uint8Array): Promise<Result<void, ThemeExportFailure>>;
  writeAsset(path: ThemeAssetPath, contents: Uint8Array): Promise<Result<void, ThemeExportFailure>>;
  /** Publishes everything written so far. Nothing is visible at the destination before this. */
  commit(): Promise<Result<void, ThemeExportFailure>>;
  /** Removes everything written so far. Always safe to call, including after a failure. */
  discard(): Promise<void>;
}
