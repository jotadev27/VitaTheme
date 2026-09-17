import type { ValidationIssue } from '@/domain/validation/issue';

/**
 * The parts of a theme the interface is divided into, and where a reported problem belongs.
 *
 * Validation anchors every issue to a dotted path inside the project. Mapping those paths to
 * sections is how the interface takes someone straight to the thing that is wrong; it routes,
 * it does not judge — which issues exist, and how serious they are, is the validator's answer.
 */
export type SectionId = 'overview' | 'home' | 'start-screen' | 'information-bar' | 'assets';

export interface Section {
  readonly id: SectionId;
  readonly label: string;
  /** What this part of the theme is, for someone who has not built one before. */
  readonly description: string;
}

export const SECTIONS: readonly Section[] = [
  { id: 'overview', label: 'Overview', description: 'Name, author and what the theme contains' },
  { id: 'home', label: 'Home screen', description: 'LiveArea pages, application icons and music' },
  { id: 'start-screen', label: 'Lock screen', description: 'Wallpaper, clock and notifications' },
  { id: 'information-bar', label: 'Information bar', description: 'The bar across the top' },
  { id: 'assets', label: 'Assets', description: 'Every file the theme refers to' },
];

const SECTION_BY_PREFIX: readonly (readonly [string, SectionId])[] = [
  ['home.', 'home'],
  ['startScreen.', 'start-screen'],
  ['informationBar.', 'information-bar'],
  ['metadata.', 'overview'],
];

export const sectionForLocation = (location: string): SectionId => {
  const matched = SECTION_BY_PREFIX.find(([prefix]) => location.startsWith(prefix));
  return matched?.[1] ?? 'overview';
};

export const issuesInSection = (
  issues: readonly ValidationIssue[],
  section: SectionId,
): readonly ValidationIssue[] =>
  issues.filter((issue) => sectionForLocation(issue.location) === section);
