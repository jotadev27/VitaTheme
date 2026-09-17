import { describe, expect, it } from 'vitest';
import { applyThemeEdit, type ThemeEdit } from '@/domain/editing/theme-edit';
import { formatContentVersion } from '@/domain/model/content-version';
import { formatThemeColor } from '@/domain/model/theme-color';
import { newThemeProject, type ThemeProject } from '@/domain/model/theme-project';
import { MAX_LIVE_AREA_PAGES } from '@/domain/vita/live-area';
import { aThemeProject, assetPath } from '../support/theme-fixtures';

/**
 * Changing a theme.
 *
 * One function decides what a change means, and it decides nothing else: a value it cannot
 * interpret is refused, and everything a theme is merely *missing* is left to the validator,
 * because a theme being edited is allowed to be unfinished.
 */

const edited = (project: ThemeProject, ...edits: readonly ThemeEdit[]): ThemeProject =>
  edits.reduce((current, edit) => {
    const result = applyThemeEdit(current, edit);
    if (!result.ok) {
      throw new Error(`Expected the change to be accepted, but it was refused: ${result.error}`);
    }
    return result.value;
  }, project);

const refused = (project: ThemeProject, edit: ThemeEdit): string => {
  const result = applyThemeEdit(project, edit);
  if (result.ok) {
    throw new Error('Expected the change to be refused, but it was accepted');
  }
  return result.error;
};

const aDraft = (): ThemeProject => newThemeProject({ title: 'Midnight', provider: 'Someone' });

describe('metadata', () => {
  it('renames a theme without losing what it was translated into', () => {
    const withFrench = edited(aDraft(), {
      kind: 'set-translation',
      field: 'title',
      language: 'fr',
      value: 'Minuit',
    });

    const renamed = edited(withFrench, {
      kind: 'set-localized-default',
      field: 'title',
      value: 'Twilight',
    });

    expect(renamed.metadata.title.defaultValue).toBe('Twilight');
    expect(renamed.metadata.title.translations.get('fr')).toBe('Minuit');
  });

  it('sets the author', () => {
    const project = edited(aDraft(), {
      kind: 'set-localized-default',
      field: 'provider',
      value: 'Someone Else',
    });

    expect(project.metadata.provider.defaultValue).toBe('Someone Else');
  });

  it('removes a translation, leaving the console to fall back to the name', () => {
    const project = edited(
      aDraft(),
      { kind: 'set-translation', field: 'title', language: 'fr', value: 'Minuit' },
      { kind: 'set-translation', field: 'title', language: 'fr', value: null },
    );

    expect(project.metadata.title.translations.has('fr')).toBe(false);
  });

  it.each(['', ' ', 'not a code', 'fr/de', '12345678901'])(
    'refuses %j as a language code',
    (language) => {
      expect(
        refused(aDraft(), { kind: 'set-translation', field: 'title', language, value: 'x' }),
      ).toBe('invalid-language-code');
    },
  );

  it('sets a version the console can read', () => {
    const project = edited(aDraft(), { kind: 'set-content-version', value: '02.13' });

    expect(formatContentVersion(project.metadata.contentVersion)).toBe('02.13');
  });

  it.each(['1.0', '01-00', '1', 'aa.bb', ''])('refuses %j as a version', (value) => {
    expect(refused(aDraft(), { kind: 'set-content-version', value })).toBe(
      'invalid-content-version',
    );
  });
});

describe('colours', () => {
  it('sets a colour in the notation the theme used', () => {
    const project = edited(aDraft(), {
      kind: 'set-color',
      slot: { kind: 'barColor' },
      value: '64FFFFFF',
    });

    expect(formatThemeColor(project.informationBar.barColor!)).toBe('64FFFFFF');
  });

  it('sets a colour on one LiveArea page only', () => {
    const twoPages = edited(aDraft(), { kind: 'add-page' });

    const project = edited(twoPages, {
      kind: 'set-color',
      slot: { kind: 'bubbleFont', page: 1 },
      value: '00D1FF',
    });

    expect(project.home.pages[0]?.bubbleFontColor).toBeNull();
    expect(formatThemeColor(project.home.pages[1]?.bubbleFontColor ?? null!)).toBe('00D1FF');
  });

  it('clears a colour, which is not the same as making it black', () => {
    const project = edited(aThemeProject(), {
      kind: 'set-color',
      slot: { kind: 'dateColor' },
      value: null,
    });

    expect(project.startScreen.dateColor).toBeNull();
  });

  it.each(['nope', 'FFF', '#FFFFFF', 'GGGGGG', '123456789'])('refuses %j as a colour', (value) => {
    expect(refused(aDraft(), { kind: 'set-color', slot: { kind: 'barColor' }, value })).toBe(
      'invalid-colour',
    );
  });

  it('refuses a colour for a page the theme does not have', () => {
    expect(
      refused(aDraft(), {
        kind: 'set-color',
        slot: { kind: 'bubbleFont', page: 4 },
        value: '000000',
      }),
    ).toBe('unknown-page');
  });
});

describe('LiveArea pages', () => {
  it('adds a page, empty, at the end', () => {
    const project = edited(aDraft(), { kind: 'add-page' });

    expect(project.home.pages).toHaveLength(2);
    expect(project.home.pages[1]).toEqual({
      background: null,
      thumbnail: null,
      generatedThumbnail: false,
      waveType: null,
      bubbleFontColor: null,
      bubbleFontShadow: null,
    });
  });

  it('refuses an eleventh page, because the console has ten', () => {
    const full = Array.from({ length: MAX_LIVE_AREA_PAGES - 1 }).reduce<ThemeProject>(
      (project) => edited(project, { kind: 'add-page' }),
      aDraft(),
    );

    expect(full.home.pages).toHaveLength(MAX_LIVE_AREA_PAGES);
    expect(refused(full, { kind: 'add-page' })).toBe('too-many-pages');
  });

  it('removes a page', () => {
    const project = edited(
      aDraft(),
      { kind: 'add-page' },
      { kind: 'set-wave-type', page: 1, value: 7 },
      { kind: 'remove-page', page: 0 },
    );

    expect(project.home.pages).toHaveLength(1);
    expect(project.home.pages[0]?.waveType).toBe(7);
  });

  it('refuses to remove the last page, which would leave nothing styled', () => {
    expect(refused(aDraft(), { kind: 'remove-page', page: 0 })).toBe('last-page');
  });

  it('reorders pages', () => {
    const project = edited(
      aDraft(),
      { kind: 'add-page' },
      { kind: 'add-page' },
      { kind: 'set-wave-type', page: 2, value: 3 },
      { kind: 'move-page', page: 2, to: 0 },
    );

    expect(project.home.pages.map((page) => page.waveType)).toEqual([3, null, null]);
  });

  it('keeps a wave type it does not understand, because no list of them is documented', () => {
    const project = edited(aDraft(), { kind: 'set-wave-type', page: 0, value: 987 });

    expect(project.home.pages[0]?.waveType).toBe(987);
  });

  it('refuses a wave type that is not a whole number', () => {
    expect(refused(aDraft(), { kind: 'set-wave-type', page: 0, value: 1.5 })).toBe(
      'invalid-number',
    );
  });

  it('tells a label shadow that is off apart from one that is not set', () => {
    const off = edited(aDraft(), { kind: 'set-bubble-shadow', page: 0, value: false });
    const unset = edited(off, { kind: 'set-bubble-shadow', page: 0, value: null });

    expect(off.home.pages[0]?.bubbleFontShadow).toBe(false);
    expect(unset.home.pages[0]?.bubbleFontShadow).toBeNull();
  });
});

describe('the lock screen', () => {
  it('sets the clock position', () => {
    expect(edited(aDraft(), { kind: 'set-date-layout', value: 2 }).startScreen.dateLayout).toBe(2);
  });

  it('keeps a position nobody has documented', () => {
    expect(edited(aDraft(), { kind: 'set-date-layout', value: 9 }).startScreen.dateLayout).toBe(9);
  });

  it('clears the position, leaving the console its own default', () => {
    const project = edited(
      aDraft(),
      { kind: 'set-date-layout', value: 1 },
      { kind: 'set-date-layout', value: null },
    );

    expect(project.startScreen.dateLayout).toBeNull();
  });
});

describe('assets', () => {
  it('empties a slot', () => {
    const project = edited(aThemeProject(), {
      kind: 'clear-asset',
      slot: { kind: 'startScreenBackground' },
    });

    expect(project.startScreen.background).toBeNull();
  });

  it('empties one icon without touching the others', () => {
    const withIcons = {
      ...aThemeProject(),
      home: {
        ...aThemeProject().home,
        appIcons: new Map([
          ['browser', assetPath('icon-browser.png')],
          ['music', assetPath('icon-music.png')],
        ] as const),
      },
    };

    const project = edited(withIcons, {
      kind: 'clear-asset',
      slot: { kind: 'appIcon', application: 'browser' },
    });

    expect(project.home.appIcons.has('browser')).toBe(false);
    expect(project.home.appIcons.get('music')).toBe('icon-music.png');
  });
});

describe('what a change leaves behind', () => {
  it('never alters the theme it was given', () => {
    const before = aThemeProject();
    const snapshot = JSON.stringify({
      title: before.metadata.title.defaultValue,
      pages: before.home.pages.length,
      dateColor: before.startScreen.dateColor,
    });

    edited(
      before,
      { kind: 'set-localized-default', field: 'title', value: 'Changed' },
      { kind: 'add-page' },
      { kind: 'set-color', slot: { kind: 'dateColor' }, value: null },
    );

    expect(
      JSON.stringify({
        title: before.metadata.title.defaultValue,
        pages: before.home.pages.length,
        dateColor: before.startScreen.dateColor,
      }),
    ).toBe(snapshot);
  });

  it('leaves the theme exactly as it was when a change is refused', () => {
    const before = aDraft();

    applyThemeEdit(before, { kind: 'set-content-version', value: 'nope' });

    expect(formatContentVersion(before.metadata.contentVersion)).toBe('01.00');
  });
});
