import type { SectionId } from '../state/sections';

/**
 * The things a theme can be looked at as.
 *
 * Each one pairs with the part of the editor that decides it, so moving between editing and
 * previewing lands on the same part of the theme rather than somewhere else.
 */
export type PreviewSurfaceId = 'home' | 'lock-screen' | 'information-bar' | 'theme-list';

export interface PreviewSurface {
  readonly id: PreviewSurfaceId;
  readonly label: string;
  readonly description: string;
  readonly section: SectionId;
}

export const PREVIEW_SURFACES: readonly PreviewSurface[] = [
  {
    id: 'home',
    label: 'Home screen',
    description: 'A LiveArea page with the icons on it',
    section: 'home',
  },
  {
    id: 'lock-screen',
    label: 'Lock screen',
    description: 'Wallpaper, clock and notifications',
    section: 'start-screen',
  },
  {
    id: 'information-bar',
    label: 'Information bar',
    description: 'Colours and badges, close up',
    section: 'information-bar',
  },
  {
    id: 'theme-list',
    label: 'Theme list',
    description: 'How the theme is seen before it is applied',
    section: 'overview',
  },
];

export const surfaceForSection = (section: SectionId): PreviewSurfaceId =>
  PREVIEW_SURFACES.find((surface) => surface.section === section)?.id ?? 'home';

export const sectionForSurface = (surface: PreviewSurfaceId): SectionId =>
  PREVIEW_SURFACES.find((candidate) => candidate.id === surface)?.section ?? 'overview';
