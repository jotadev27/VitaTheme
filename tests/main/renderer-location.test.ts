import { describe, expect, it } from 'vitest';
import { developmentRendererUrl } from '@/main/renderer-location';

describe('renderer location', () => {
  it('ignores an injected development URL in a packaged application', () => {
    expect(developmentRendererUrl(true, 'https://example.invalid/foreign-page')).toBeUndefined();
  });

  it('uses the development server only before packaging', () => {
    expect(developmentRendererUrl(false, 'http://localhost:5173')).toBe('http://localhost:5173');
  });
});
