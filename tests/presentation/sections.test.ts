import { describe, expect, it } from 'vitest';
import { validationError, validationWarning } from '@/domain/validation/issue';
import { issuesInSection, SECTIONS, sectionForLocation } from '@/presentation/state/sections';

/**
 * Taking someone to the thing that is wrong.
 *
 * Validation anchors an issue to a dotted path inside the project; the interface has to know
 * which part of the window that is. Nothing here decides whether an issue matters.
 */
describe('sectionForLocation', () => {
  it.each([
    ['home.pages[0].background', 'home'],
    ['home.appIcons.browser', 'home'],
    ['home.backgroundMusic', 'home'],
    ['startScreen.background', 'start-screen'],
    ['startScreen.dateLayout', 'start-screen'],
    ['informationBar.barColor', 'information-bar'],
    ['metadata.title', 'overview'],
    ['metadata.title.translations.fr', 'overview'],
  ])('sends %s to the %s section', (location, expected) => {
    expect(sectionForLocation(location)).toBe(expected);
  });

  it('keeps an issue about the theme as a whole in the overview', () => {
    expect(sectionForLocation('theme')).toBe('overview');
  });

  it('has a section for every location it can be given', () => {
    const known = new Set(SECTIONS.map((section) => section.id));

    for (const location of ['home.x', 'startScreen.x', 'informationBar.x', 'metadata.x', 'x']) {
      expect(known.has(sectionForLocation(location))).toBe(true);
    }
  });
});

describe('issuesInSection', () => {
  const issues = [
    validationError('asset.missing', 'home.pages[0].background', 'missing background'),
    validationWarning('metadata.preview-missing', 'metadata.homePreview', 'no preview'),
    validationWarning('start-screen.background-missing', 'startScreen.background', 'no wallpaper'),
    validationWarning('home.icon-set-incomplete', 'home.appIcons', 'icons'),
  ];

  it('gathers what belongs to one part of the theme', () => {
    expect(issuesInSection(issues, 'home').map((issue) => issue.location)).toEqual([
      'home.pages[0].background',
      'home.appIcons',
    ]);
  });

  it('returns nothing for a part with nothing wrong with it', () => {
    expect(issuesInSection(issues, 'information-bar')).toEqual([]);
  });

  it('accounts for every issue exactly once across the sections', () => {
    const counted = SECTIONS.reduce(
      (total, section) => total + issuesInSection(issues, section.id).length,
      0,
    );

    // `assets` holds files rather than locations, so it claims none of them.
    expect(counted).toBe(issues.length);
  });
});
