import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { failure, type Result } from '../../domain/shared/result';
import type { AssetLookup } from '../../domain/validation/asset-catalog';

/**
 * Upper bound on a single theme asset, enforced by every implementation of this port.
 *
 * Exporting reads an asset into memory before writing it out. The largest legitimate asset
 * is background music, and a whole shareable theme is capped at 30 MB by the repositories,
 * so this ceiling is far above anything a theme needs. It exists so that a file referenced
 * by mistake — a video, a disk image — is refused with an explanation instead of being
 * pulled into memory.
 */
export const MAX_THEME_ASSET_BYTES = 64 * 1024 * 1024;

export type ThemeAssetReadErrorCode =
  | 'missing'
  | 'not-a-file'
  | 'too-large'
  /** The path resolved to a location outside the theme, through a symbolic link or otherwise. */
  | 'escapes-theme'
  | 'unreadable';

export interface ThemeAssetReadError {
  readonly code: ThemeAssetReadErrorCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

/**
 * Read access to the files a theme references.
 *
 * Validation only needs to know *about* a file, which is what `inspectAsset` reports from a
 * container header. Exporting needs the bytes themselves, which is the only reason
 * `openAsset` exists — keeping them apart means validating an untrusted theme never reads a
 * whole file. Implementations are responsible for confining every access to the theme.
 */
export interface ThemeAssetSource {
  inspectAsset(path: ThemeAssetPath): Promise<AssetLookup>;
  openAsset(path: ThemeAssetPath): Promise<Result<Uint8Array, ThemeAssetReadError>>;
}

/**
 * A theme with no files behind it: a draft that has not been given any assets yet.
 *
 * It answers honestly rather than pretending to succeed, so a draft that refers to a file it
 * never had is reported the same way a folder missing one would be.
 */
export const emptyThemeAssetSource = (): ThemeAssetSource => ({
  inspectAsset: () => Promise.resolve({ status: 'missing' }),
  openAsset: (path) =>
    Promise.resolve(
      failure<ThemeAssetReadError>({
        code: 'missing',
        message: `The theme refers to "${path}", but this theme has no files yet.`,
      }),
    ),
});
