import { describe, expect, it } from 'vitest';
import { parseThemeAssetPath } from '@/domain/model/theme-asset-path';
import { DEFAULT_THEME_FILE_NAME, themeFileName } from '@/domain/model/theme-name';

const MAX_FILE_NAME_LENGTH = 64;

describe('themeFileName', () => {
  it('keeps a name that is already usable', () => {
    expect(themeFileName('Midnight Blue')).toBe('Midnight Blue');
  });

  it.each([
    ['Sky/Blue', 'Sky Blue', 'a path separator'],
    ['Sky\\Blue', 'Sky Blue', 'a Windows separator'],
    ['Theme: Remastered', 'Theme Remastered', 'a colon'],
    ['What?', 'What', 'a character Windows refuses'],
    ['  Padded  ', 'Padded', 'surrounding space'],
    ['Double  space', 'Double space', 'a run of whitespace'],
    ['Trailing dot.', 'Trailing dot', 'a trailing dot Windows would drop'],
  ])('rewrites %j as %j — %s', (title, expected) => {
    expect(themeFileName(title)).toBe(expected);
  });

  it('falls back when nothing usable is left', () => {
    expect(themeFileName('   ')).toBe(DEFAULT_THEME_FILE_NAME);
    expect(themeFileName('///')).toBe(DEFAULT_THEME_FILE_NAME);
  });

  it('refuses a name Windows resolves to a device', () => {
    expect(themeFileName('CON')).toBe(DEFAULT_THEME_FILE_NAME);
    expect(themeFileName('LPT1.theme')).toBe(DEFAULT_THEME_FILE_NAME);
  });

  it('shortens a title that is too long for a file name', () => {
    const name = themeFileName('A'.repeat(300));

    expect(name.length).toBeLessThanOrEqual(MAX_FILE_NAME_LENGTH);
    expect(name.startsWith('AAAA')).toBe(true);
  });

  it('always produces something the path rules accept', () => {
    const titles = [
      'Midnight Blue',
      '../../etc/passwd',
      `null${String.fromCharCode(0)}byte`,
      'emoji theme',
      'aux',
      '.',
      '..',
      'ends with space ',
      '',
    ];

    for (const title of titles) {
      expect(parseThemeAssetPath(themeFileName(title)).ok, JSON.stringify(title)).toBe(true);
    }
  });
});
