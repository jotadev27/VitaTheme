import { describe, expect, it } from 'vitest';
import {
  contentVersion,
  formatContentVersion,
  parseContentVersion,
} from '@/domain/model/content-version';

describe('parseContentVersion', () => {
  it('reads the NN.NN form the console requires', () => {
    expect(parseContentVersion('01.00')).toEqual({ ok: true, value: { major: 1, minor: 0 } });
  });

  it('keeps a leading zero rather than treating the value as a number', () => {
    expect(parseContentVersion('01.10')).toEqual({ ok: true, value: { major: 1, minor: 10 } });
  });

  it.each([
    ['', 'empty'],
    ['1.0', 'malformed'],
    ['01.0', 'malformed'],
    ['1.00', 'malformed'],
    ['01.00.00', 'malformed'],
    ['v01.00', 'malformed'],
    ['aa.bb', 'malformed'],
  ])('rejects %j, which the console would refuse to parse', (raw, expected) => {
    expect(parseContentVersion(raw)).toEqual({ ok: false, error: expected });
  });
});

describe('formatContentVersion', () => {
  it.each([
    [{ major: 1, minor: 0 }, '01.00'],
    [{ major: 12, minor: 34 }, '12.34'],
    [{ major: 0, minor: 5 }, '00.05'],
  ])('writes %o as %j', (version, expected) => {
    expect(formatContentVersion(version)).toBe(expected);
  });

  it('round-trips every value it accepts', () => {
    for (let major = 0; major <= 99; major += 1) {
      const built = contentVersion(major, 99 - major);
      expect(built.ok).toBe(true);
      if (built.ok) {
        expect(parseContentVersion(formatContentVersion(built.value))).toEqual(built);
      }
    }
  });
});

describe('contentVersion', () => {
  it.each([
    [-1, 0],
    [100, 0],
    [0, 100],
    [1.5, 0],
  ])('rejects the out-of-range pair (%d, %d)', (major, minor) => {
    expect(contentVersion(major, minor)).toEqual({ ok: false, error: 'malformed' });
  });
});
