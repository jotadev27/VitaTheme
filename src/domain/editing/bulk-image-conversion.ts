import { imageConversionTarget, imageConversionWouldChange } from './image-conversion';
import { assetAtSlot, assetSlotUsage, type ThemeAssetSlot } from './theme-asset-slot';
import type { ThemeProject } from '../model/theme-project';
import type { ThemeAssetSummary } from '../validation/asset-inventory';
import { HOME_APP_SLOT_IDS } from '../vita/home-app-slots';

/** Only occupied, inspected image slots that the existing converter can improve. */
export const incompatibleImageSlots = (
  project: ThemeProject,
  assets: readonly ThemeAssetSummary[],
): readonly ThemeAssetSlot[] => {
  const slots: ThemeAssetSlot[] = [
    ...project.home.pages.flatMap((_, page): ThemeAssetSlot[] => [
      { kind: 'liveAreaBackground', page },
      { kind: 'liveAreaThumbnail', page },
    ]),
    ...HOME_APP_SLOT_IDS.map((application): ThemeAssetSlot => ({ kind: 'appIcon', application })),
    { kind: 'basePageIndicator' },
    { kind: 'currentPageIndicator' },
    { kind: 'noNoticeBadge' },
    { kind: 'newNoticeBadge' },
    { kind: 'startScreenBackground' },
    { kind: 'homePreview' },
    { kind: 'startScreenPreview' },
    { kind: 'packageThumbnail' },
  ];

  return slots.filter((slot) => {
    // Generated thumbnails follow their backgrounds. Custom thumbnails are author artwork
    // and are only changed when their own slot is chosen explicitly.
    if (slot.kind === 'liveAreaThumbnail') return false;
    const usage = assetSlotUsage(slot);
    if (usage === 'backgroundMusic') return false;
    const path = assetAtSlot(project, slot);
    const summary = assets.find((asset) => asset.path === path);
    return (
      path !== null &&
      summary?.lookup.status === 'found' &&
      summary.lookup.asset.media.kind === 'image' &&
      imageConversionWouldChange(imageConversionTarget(usage), summary.lookup.asset.media)
    );
  });
};
