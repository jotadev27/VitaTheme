import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { distinctAssetPaths, type ThemeProject } from '../../domain/model/theme-project';
import { isExportable, type ValidationReport } from '../../domain/validation/report';
import { validateThemeProject } from '../../domain/validation/validate-theme-project';
import type { ThemeAssetReadError, ThemeAssetSource } from '../ports/theme-assets';
import {
  themeExportFailure,
  type ThemeExportFailure,
  type ThemeExportTarget,
} from '../ports/theme-export-target';
import type { ThemeManifestCodec } from '../ports/theme-manifest-codec';
import { inspectThemeAssets } from '../services/inspect-theme-assets';

export interface ThemeExportSummary {
  /** The manifest plus every distinct asset that was copied. */
  readonly fileCount: number;
  /** Size of the theme's files. An archive on disk is smaller, since it is compressed. */
  readonly totalBytes: number;
  /** The assets that were copied, in the order they were written. */
  readonly assetPaths: readonly ThemeAssetPath[];
}

export type ExportThemeOutcome =
  | {
      readonly status: 'exported';
      /** Warnings the author should still see: they never block an export. */
      readonly report: ValidationReport;
      readonly summary: ThemeExportSummary;
    }
  /** The theme breaks a rule the format is certain about. Nothing was written. */
  | { readonly status: 'blocked'; readonly report: ValidationReport }
  /** The theme is valid but could not be written. Nothing was published. */
  | { readonly status: 'failed'; readonly failure: ThemeExportFailure };

export interface ExportThemeDependencies {
  readonly project: ThemeProject;
  readonly assets: ThemeAssetSource;
  readonly codec: ThemeManifestCodec;
  readonly target: ThemeExportTarget;
}

export interface ExportValidatedThemeDependencies extends ExportThemeDependencies {
  readonly report: ValidationReport;
}

const assetFailure = (path: ThemeAssetPath, error: ThemeAssetReadError): ThemeExportFailure => {
  switch (error.code) {
    case 'missing':
      return themeExportFailure('asset-missing', error.message, path);
    case 'too-large':
      return themeExportFailure('asset-too-large', error.message, path);
    default:
      return themeExportFailure('asset-unreadable', error.message, path);
  }
};

/** Leaves the destination as it was found: an export is published only by `commit`. */
const abandon = async (
  target: ThemeExportTarget,
  failure: ThemeExportFailure,
): Promise<ExportThemeOutcome> => {
  await target.discard();
  return { status: 'failed', failure };
};

/**
 * Writes a theme that has already been validated.
 *
 * The report is re-checked rather than trusted: it is the one thing standing between a
 * broken theme and a memory card, and this is the only place that decides. Warnings are
 * carried through to the caller untouched, because several of them cover rules the format
 * does not document with certainty and an author is free to ignore them.
 */
export const exportValidatedTheme = async ({
  project,
  report,
  assets,
  codec,
  target,
}: ExportValidatedThemeDependencies): Promise<ExportThemeOutcome> => {
  if (!isExportable(report)) {
    await target.discard();
    return { status: 'blocked', report };
  }

  const manifest = new TextEncoder().encode(codec.serialize(project));
  const manifestWritten = await target.writeManifest(manifest);
  if (!manifestWritten.ok) {
    return abandon(target, manifestWritten.error);
  }

  const assetPaths = distinctAssetPaths(project);
  let totalBytes = manifest.byteLength;

  // Copied one at a time, in a stable order: the whole theme is never held in memory at
  // once, and two exports of the same project produce the same archive byte for byte.
  for (const path of assetPaths) {
    const opened = await assets.openAsset(path);
    if (!opened.ok) {
      return abandon(target, assetFailure(path, opened.error));
    }

    const written = await target.writeAsset(path, opened.value);
    if (!written.ok) {
      return abandon(target, written.error);
    }

    totalBytes += opened.value.byteLength;
  }

  const committed = await target.commit();
  if (!committed.ok) {
    return abandon(target, committed.error);
  }

  return {
    status: 'exported',
    report,
    summary: { fileCount: assetPaths.length + 1, totalBytes, assetPaths },
  };
};

/**
 * Validates a theme and, if it holds up, writes it to the target.
 *
 * The target is owned by this use case once it is handed over: whatever happens, it ends
 * either committed or discarded, so a destination is never left holding half a theme.
 */
export const exportTheme = async ({
  project,
  assets,
  codec,
  target,
}: ExportThemeDependencies): Promise<ExportThemeOutcome> => {
  const catalog = await inspectThemeAssets(project, assets);
  const report = validateThemeProject(project, catalog);

  return exportValidatedTheme({ project, report, assets, codec, target });
};
