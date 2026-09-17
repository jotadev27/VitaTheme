import { describe, expect, it } from 'vitest';
import {
  assetPathExtension,
  parseThemeAssetPath,
  type ThemeAssetPathError,
} from '@/domain/model/theme-asset-path';
import { assetPath } from '../support/theme-fixtures';

const rejectionReason = (raw: string): ThemeAssetPathError => {
  const parsed = parseThemeAssetPath(raw);
  if (parsed.ok) {
    throw new Error(`Expected "${raw}" to be rejected, but it parsed as "${parsed.value}"`);
  }
  return parsed.error;
};

describe('parseThemeAssetPath', () => {
  it.each(['bg1.png', 'icons/browser.png', 'assets/pages/01/background.png', 'BGM.at9'])(
    'accepts the relative theme path %j',
    (raw) => {
      const parsed = parseThemeAssetPath(raw);
      expect(parsed).toEqual({ ok: true, value: raw });
    },
  );

  it('trims surrounding whitespace left by hand-edited manifests', () => {
    expect(parseThemeAssetPath('  bg1.png  ')).toEqual({ ok: true, value: 'bg1.png' });
  });

  describe('rejects paths that would escape the theme folder', () => {
    it.each([
      ['../../etc/passwd', 'traversal-segment'],
      ['assets/../../outside.png', 'traversal-segment'],
      ['./bg1.png', 'traversal-segment'],
      ['/etc/passwd', 'absolute'],
      ['/', 'absolute'],
    ])('%j', (raw, expected) => {
      expect(rejectionReason(raw)).toBe(expected);
    });
  });

  describe('rejects platform-specific path syntax', () => {
    it.each([
      ['C:/Windows/System32/drivers/etc/hosts', 'colon'],
      ['background.png:hidden', 'colon'],
      ['assets\\bg1.png', 'backslash-separator'],
      ['..\\..\\outside.png', 'backslash-separator'],
      ['con.png', 'reserved-device-name'],
      ['icons/NUL', 'reserved-device-name'],
      ['icons/lpt1.png', 'reserved-device-name'],
      ['assets./bg1.png', 'trailing-dot-or-space'],
      ['assets /bg1.png', 'trailing-dot-or-space'],
    ])('%j', (raw, expected) => {
      expect(rejectionReason(raw)).toBe(expected);
    });
  });

  describe('rejects malformed input', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'empty'],
      ['assets//bg1.png', 'empty-segment'],
      ['bg1\u0000.png', 'control-characters'],
      ['bg1\u007F.png', 'control-characters'],
      [`${'a'.repeat(256)}.png`, 'too-long'],
    ])('%j', (raw, expected) => {
      expect(rejectionReason(raw)).toBe(expected);
    });
  });

  it('keeps a reserved device name usable as an ordinary word', () => {
    expect(parseThemeAssetPath('console.png')).toEqual({ ok: true, value: 'console.png' });
  });
});

describe('assetPathExtension', () => {
  it.each([
    ['bg1.png', '.png'],
    ['icons/browser.PNG', '.png'],
    ['BGM.at9', '.at9'],
    ['assets/no-extension', ''],
    ['.gitignore', ''],
    ['archive.tar.gz', '.gz'],
  ])('reads %j as %j', (raw, expected) => {
    expect(assetPathExtension(assetPath(raw))).toBe(expected);
  });
});
