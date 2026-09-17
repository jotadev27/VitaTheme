import type { ThemeProject } from '../../domain/model/theme-project';
import type { AssetCatalog } from '../../domain/validation/asset-catalog';
import { validationReport, type ValidationReport } from '../../domain/validation/report';
import { validateThemeProject } from '../../domain/validation/validate-theme-project';
import type { ManifestParseError, ThemeManifestCodec } from '../ports/theme-manifest-codec';
import type { ThemeFolder, ThemeFolderError } from '../ports/theme-folder';
import { inspectThemeAssets } from '../services/inspect-theme-assets';

export interface ValidateThemeFolderDependencies {
  readonly folder: ThemeFolder;
  readonly codec: ThemeManifestCodec;
}

export type ValidateThemeFolderOutcome =
  | {
      readonly status: 'validated';
      readonly project: ThemeProject;
      readonly report: ValidationReport;
      /**
       * What was found for each file, so a caller can describe the theme without inspecting
       * it a second time. Not serialisable, and not meant to leave the process.
       */
      readonly catalog: AssetCatalog;
    }
  /** The theme could not be opened at all, so there is nothing to validate. */
  | { readonly status: 'unopenable'; readonly error: ThemeFolderError | ManifestParseError };

/**
 * Opens a theme folder, reads its manifest and reports every problem found in one pass.
 *
 * Problems detected while reading the manifest are merged into the same report as the rule
 * violations, so the user interface has a single list to present rather than two error
 * channels that mean much the same thing to the author.
 */
export const validateThemeFolder = async ({
  folder,
  codec,
}: ValidateThemeFolderDependencies): Promise<ValidateThemeFolderOutcome> => {
  const manifest = await folder.readManifest();
  if (!manifest.ok) {
    return { status: 'unopenable', error: manifest.error };
  }

  const parsed = codec.parse(manifest.value);
  if (!parsed.ok) {
    return { status: 'unopenable', error: parsed.error };
  }

  const { project, issues: manifestIssues } = parsed.value;
  const catalog = await inspectThemeAssets(project, folder);
  const report = validateThemeProject(project, catalog);

  return {
    status: 'validated',
    project,
    report: validationReport([...manifestIssues, ...report.issues]),
    catalog,
  };
};
