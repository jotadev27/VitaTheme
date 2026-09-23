import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const path = (relative: string) => `${root}${relative}`;

describe('platform icon resources', () => {
  it('keeps the macOS white icon and gives Windows and Linux transparent edges', async () => {
    const mac = await Jimp.read(path('packaging/icon.png'));
    const linux = await Jimp.read(path('packaging/linux/256x256.png'));
    const transparentMark = await Jimp.read(path('assets/branding/vitatheme-mark-transparent.png'));
    expect(mac.bitmap.width).toBe(1024);
    expect([...mac.bitmap.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...linux.bitmap.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(transparentMark.bitmap.data[3]).toBe(0);
    expect(linux.bitmap.data.some((value, index) => index % 4 === 3 && value === 255)).toBe(true);
  });

  it('carries multiple PNG resolutions in the Windows ICO', async () => {
    const ico = await readFile(path('packaging/icon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(7);
    const sizes: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const at = 6 + index * 16;
      sizes.push(ico[at] === 0 ? 256 : ico[at]!);
      const offset = ico.readUInt32LE(at + 12);
      expect([...ico.subarray(offset, offset + 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });

  it('connects the icon resources to packaging and the Linux application window', async () => {
    const config = await readFile(path('electron-builder.yml'), 'utf8');
    const windowSource = await readFile(path('src/main/window.ts'), 'utf8');
    expect(config).toContain('icon: packaging/icon.ico');
    expect(config).toContain('icon: packaging/linux');
    expect(config).toContain('syncDesktopName: true');
    expect(config).toContain('to: icon.png');
    expect(windowSource).toContain("join(process.resourcesPath, 'icon.png')");
  });
});
