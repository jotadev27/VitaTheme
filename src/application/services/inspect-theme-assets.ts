import { distinctAssetPaths, type ThemeProject } from '../../domain/model/theme-project';
import { assetCatalogOf, type AssetCatalog } from '../../domain/validation/asset-catalog';
import type { ThemeAssetSource } from '../ports/theme-assets';

/**
 * Inspects every file a theme references and collects the facts the domain validates over.
 *
 * Each file is inspected once, however many fields point at it, and a file the theme does
 * not reference is never touched: validating a theme must not become a reason to read the
 * rest of a folder.
 */
export const inspectThemeAssets = async (
  project: ThemeProject,
  source: ThemeAssetSource,
): Promise<AssetCatalog> => {
  const entries = await Promise.all(
    distinctAssetPaths(project).map(
      async (path) => [path, await source.inspectAsset(path)] as const,
    ),
  );

  return assetCatalogOf(new Map(entries));
};
