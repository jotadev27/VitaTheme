import type { ThemeProject } from '../model/theme-project';
import { emptyAssetCatalog, type AssetCatalog } from './asset-catalog';
import { validationReport, type ValidationReport } from './report';
import { validateAssets } from './validate-assets';
import { validateStructure } from './validate-structure';

/**
 * Validates a theme against the PS Vita format rules.
 *
 * Pure and synchronous: the caller inspects the referenced files beforehand and supplies
 * the facts through `catalog`. Structural rules are checked even when no catalog is
 * available, so a draft can be validated before anything is written to disk.
 */
export const validateThemeProject = (
  project: ThemeProject,
  catalog: AssetCatalog = emptyAssetCatalog(),
): ValidationReport =>
  validationReport([...validateStructure(project), ...validateAssets(project, catalog)]);
