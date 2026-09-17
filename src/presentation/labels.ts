import type { ThemeAssetUsage } from '@/domain/model/theme-project';
import { imageAssetSpec } from '@/domain/vita/asset-specs';

/**
 * Names for the things a theme is made of.
 *
 * Taken from the format layer wherever it has one, so the interface calls an asset what the
 * validator calls it in the message next to it, and a correction in one place changes both.
 */
export const usageLabel = (usage: ThemeAssetUsage): string =>
  usage === 'backgroundMusic' ? 'Background music' : imageAssetSpec(usage).label;
