import type { InspectedAsset } from '../model/media';
import type { ThemeAssetPath } from '../model/theme-asset-path';

/**
 * What the application found for each asset a theme references.
 *
 * The domain never touches the filesystem: an outer layer inspects the files and hands the
 * facts in, which keeps validation pure, synchronous and trivially testable, and keeps the
 * rules reusable over a folder on disk, an archive, or an in-memory draft.
 */
export type AssetLookup =
  | { readonly status: 'found'; readonly asset: InspectedAsset }
  | { readonly status: 'missing' }
  /** The file exists but could not be read; `reason` is a user-facing summary. */
  | { readonly status: 'unreadable'; readonly reason: string };

export interface AssetCatalog {
  lookup(path: ThemeAssetPath): AssetLookup;
}

export const assetCatalogOf = (entries: ReadonlyMap<string, AssetLookup>): AssetCatalog => ({
  lookup: (path) => entries.get(path) ?? { status: 'missing' },
});

export const emptyAssetCatalog = (): AssetCatalog => ({ lookup: () => ({ status: 'missing' }) });
