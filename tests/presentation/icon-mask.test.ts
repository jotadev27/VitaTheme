import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const path = fileURLToPath(new URL('../../src/presentation/styles/preview.css', import.meta.url));

describe('home bubble preview mask', () => {
  it('clips the complete icon element for transparent PNG, opaque PNG, JPEG and defaults', async () => {
    const css = await readFile(path, 'utf8');
    const bubble = /\.screen-bubble-icon\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const image = /\.screen-bubble-icon img\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(bubble).toContain('clip-path: circle(50%)');
    expect(bubble).toContain('overflow: hidden');
    expect(image).toContain('object-fit: cover');
  });
});
