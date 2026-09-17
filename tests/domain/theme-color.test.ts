import { describe, expect, it } from 'vitest';
import { formatThemeColor, parseThemeColor } from '@/domain/model/theme-color';
import { color } from '../support/theme-fixtures';

describe('parseThemeColor', () => {
  it('reads six digits as an opaque colour', () => {
    expect(parseThemeColor('00D1FF')).toEqual({
      ok: true,
      value: { alpha: 0xff, red: 0x00, green: 0xd1, blue: 0xff, hasExplicitAlpha: false },
    });
  });

  it('reads eight digits as alpha followed by colour', () => {
    expect(parseThemeColor('64FFFFFF')).toEqual({
      ok: true,
      value: { alpha: 0x64, red: 0xff, green: 0xff, blue: 0xff, hasExplicitAlpha: true },
    });
  });

  it('accepts the mixed digit case real themes are written in', () => {
    expect(parseThemeColor('FFf8aec0')).toEqual(parseThemeColor('fff8AEC0'));
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['FFF', 'unsupported-length'],
    ['00D1FF00D1FF', 'unsupported-length'],
    ['#00D1FF', 'unsupported-length'],
    ['00D1FZ', 'non-hexadecimal-characters'],
    ['rgb(0,0,0)', 'unsupported-length'],
  ])('rejects %j', (raw, expected) => {
    expect(parseThemeColor(raw)).toEqual({ ok: false, error: expected });
  });
});

describe('formatThemeColor', () => {
  it('keeps a colour written without alpha in six-digit form', () => {
    expect(formatThemeColor(color('00d1ff'))).toBe('00D1FF');
  });

  it('keeps a colour written with alpha in eight-digit form', () => {
    expect(formatThemeColor(color('64ffffff'))).toBe('64FFFFFF');
  });

  it.each(['00D1FF', 'FFF8AEC0', '00000000', 'FFFFFF'])('round-trips %j', (raw) => {
    expect(formatThemeColor(color(raw))).toBe(raw);
  });
});
