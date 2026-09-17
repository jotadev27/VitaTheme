import type { ThemeAssetPath } from '../model/theme-asset-path';
import {
  collectAssetReferences,
  type ThemeAssetUsage,
  type ThemeProject,
} from '../model/theme-project';
import type { AssetCatalog, AssetLookup } from './asset-catalog';

/**
 * What a theme holds, file by file rather than field by field.
 *
 * The validator works through references, because a rule applies to the field a file is used
 * in. Someone looking at their theme thinks in files, and a file used by several fields is
 * still one file to copy, one size to account for and one thing to fix. This projection
 * turns the one view into the other; it decides nothing and adds no rules.
 */
export interface ThemeAssetSummary {
  readonly path: ThemeAssetPath;
  /** Every role the file plays, in the order the theme declares them. */
  readonly usages: readonly ThemeAssetUsage[];
  /** Where in the project each of those roles sits, for anchoring an issue to a file. */
  readonly locations: readonly string[];
  readonly lookup: AssetLookup;
}

export const summarizeThemeAssets = (
  project: ThemeProject,
  catalog: AssetCatalog,
): readonly ThemeAssetSummary[] => {
  const summaries = new Map<ThemeAssetPath, { usages: ThemeAssetUsage[]; locations: string[] }>();

  for (const reference of collectAssetReferences(project)) {
    const existing = summaries.get(reference.path);
    if (existing === undefined) {
      summaries.set(reference.path, {
        usages: [reference.usage],
        locations: [reference.location],
      });
      continue;
    }

    if (!existing.usages.includes(reference.usage)) {
      existing.usages.push(reference.usage);
    }
    existing.locations.push(reference.location);
  }

  return [...summaries].map(([path, { usages, locations }]) => ({
    path,
    usages,
    locations,
    lookup: catalog.lookup(path),
  }));
};
