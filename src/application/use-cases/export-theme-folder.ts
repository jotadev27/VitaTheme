import type { ThemeExportTarget } from '../ports/theme-export-target';
import type { ThemeFolder, ThemeFolderError } from '../ports/theme-folder';
import type { ManifestParseError, ThemeManifestCodec } from '../ports/theme-manifest-codec';
import { exportValidatedTheme, type ExportThemeOutcome } from './export-theme';
import { validateThemeFolder } from './validate-theme-folder';

export interface ExportThemeFolderDependencies {
  readonly folder: ThemeFolder;
  readonly codec: ThemeManifestCodec;
  readonly target: ThemeExportTarget;
}

export type ExportThemeFolderOutcome =
  | ExportThemeOutcome
  /** The source theme could not be opened at all, so there was nothing to export. */
  | { readonly status: 'unopenable'; readonly error: ThemeFolderError | ManifestParseError };

/**
 * Exports an existing theme folder: reads it, validates it and writes it out.
 *
 * Problems in the source manifest are part of the same report as the rule violations, so a
 * theme that cannot be read faithfully is blocked rather than exported with the unreadable
 * parts quietly dropped.
 */
export const exportThemeFolder = async ({
  folder,
  codec,
  target,
}: ExportThemeFolderDependencies): Promise<ExportThemeFolderOutcome> => {
  const validated = await validateThemeFolder({ folder, codec });
  if (validated.status === 'unopenable') {
    await target.discard();
    return validated;
  }

  return exportValidatedTheme({
    project: validated.project,
    report: validated.report,
    assets: folder,
    codec,
    target,
  });
};
