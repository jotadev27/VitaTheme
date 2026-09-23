import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import { homeAppSlot } from '@/domain/vita/home-app-slots';

/** A readable name for the image being positioned in the crop editor. */
export const assetSlotLabel = (slot: ThemeAssetSlot): string => {
  switch (slot.kind) {
    case 'liveAreaBackground':
      return 'LiveArea background';
    case 'liveAreaThumbnail':
      return 'LiveArea thumbnail';
    case 'appIcon':
      return `${homeAppSlot(slot.application).label} icon`;
    case 'basePageIndicator':
      return 'Page indicator';
    case 'currentPageIndicator':
      return 'Current page indicator';
    case 'backgroundMusic':
      return 'Background music';
    case 'noNoticeBadge':
      return 'No notifications badge';
    case 'newNoticeBadge':
      return 'Notification waiting badge';
    case 'startScreenBackground':
      return 'Start screen background';
    case 'homePreview':
      return 'Home screen preview';
    case 'startScreenPreview':
      return 'Start screen preview';
    case 'packageThumbnail':
      return 'Theme thumbnail';
  }
};
