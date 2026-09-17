import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, open, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_THEME_ASSET_BYTES } from '@/application/ports/theme-assets';
import type { ThemeFolder } from '@/application/ports/theme-folder';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { MINIMAL_MANIFEST } from '../support/manifest-fixtures';
import { assetPath } from '../support/theme-fixtures';
import { pngHeaderBytes } from '../support/binary-fixtures';

/**
 * Creating a symbolic link needs a privilege that is not granted by default on Windows, so
 * the escape tests are skipped rather than failed there.
 *
 * This runs while the file is being collected, not in a hook: `skipIf` is evaluated as the
 * suite is built, so a flag set in `beforeAll` would still read `false` and would silently
 * skip the tests everywhere.
 */
const symbolicLinksAvailable = ((): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'vitatheme-symlink-probe-'));
  try {
    writeFileSync(join(probe, 'target'), 'probe');
    symlinkSync(join(probe, 'target'), join(probe, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

let workspace: string;
let themeRoot: string;
let outsideRoot: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-'));
  themeRoot = join(workspace, 'theme');
  outsideRoot = join(workspace, 'outside');
  await mkdir(themeRoot);
  await mkdir(outsideRoot);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const writeManifest = (contents = MINIMAL_MANIFEST): Promise<void> =>
  writeFile(join(themeRoot, 'theme.xml'), contents, 'utf-8');

const openTheme = async (path = themeRoot): Promise<ThemeFolder> => {
  const opened = await openThemeFolder(path);
  if (!opened.ok) {
    throw new Error(`Expected the folder to open, but it failed: ${opened.error.message}`);
  }
  return opened.value;
};

const failureOpening = async (path: string) => {
  const opened = await openThemeFolder(path);
  if (opened.ok) {
    throw new Error('Expected opening the folder to fail, but it succeeded');
  }
  return opened.error;
};

describe('openThemeFolder', () => {
  it('opens a folder that holds a manifest', async () => {
    await writeManifest();
    const folder = await openTheme();

    const manifest = await folder.readManifest();
    expect(manifest.ok).toBe(true);
  });

  it('reports a folder that does not exist', async () => {
    expect((await failureOpening(join(workspace, 'nowhere'))).code).toBe('not-found');
  });

  it('reports a path that is a file rather than a folder', async () => {
    const file = join(workspace, 'theme.zip');
    await writeFile(file, 'not a folder');

    expect((await failureOpening(file)).code).toBe('not-a-directory');
  });

  it('does not put the location of the folder into the message shown to the user', async () => {
    const error = await failureOpening(join(workspace, 'nowhere'));

    expect(error.message).not.toContain(workspace);
    expect(error.message).not.toContain(tmpdir());
  });
});

describe('readManifest', () => {
  it('reads the manifest as text', async () => {
    await writeManifest();
    const manifest = await (await openTheme()).readManifest();

    expect(manifest.ok && manifest.value).toContain('<theme');
  });

  it('reports a folder with no manifest as not being a theme', async () => {
    const manifest = await (await openTheme()).readManifest();

    expect(manifest.ok).toBe(false);
    if (!manifest.ok) {
      expect(manifest.error.code).toBe('manifest-missing');
      expect(manifest.error.message).toContain('theme.xml');
    }
  });

  it('strips a byte order mark, which the XML parser would reject', async () => {
    await writeManifest(`\uFEFF${MINIMAL_MANIFEST}`);
    const manifest = await (await openTheme()).readManifest();

    expect(manifest.ok && manifest.value.startsWith('<?xml')).toBe(true);
  });
});

describe('inspectAsset', () => {
  const writeAsset = (name: string, bytes: Uint8Array): Promise<void> =>
    writeFile(join(themeRoot, name), bytes);

  it('describes an image that is present', async () => {
    await writeAsset('bg1.png', pngHeaderBytes({ width: 960, height: 512 }));
    const lookup = await (await openTheme()).inspectAsset(assetPath('bg1.png'));

    expect(lookup).toMatchObject({
      status: 'found',
      asset: { media: { kind: 'image', format: 'png', width: 960, height: 512 } },
    });
  });

  it('reports the size on disk, not the size of the header it read', async () => {
    const padded = new Uint8Array(4096);
    padded.set(pngHeaderBytes({ width: 22, height: 22 }));
    await writeAsset('curPage.png', padded);

    const lookup = await (await openTheme()).inspectAsset(assetPath('curPage.png'));

    expect(lookup).toMatchObject({ status: 'found', asset: { byteSize: 4096 } });
  });

  it('reports a file the theme references but does not contain', async () => {
    const lookup = await (await openTheme()).inspectAsset(assetPath('absent.png'));

    expect(lookup).toEqual({ status: 'missing' });
  });

  it('refuses a directory used where a file belongs', async () => {
    await mkdir(join(themeRoot, 'icons'));
    const lookup = await (await openTheme()).inspectAsset(assetPath('icons'));

    expect(lookup).toMatchObject({ status: 'unreadable' });
  });

  it('reads an asset in a subfolder of the theme', async () => {
    await mkdir(join(themeRoot, 'icons'));
    await writeAsset(join('icons', 'music.png'), pngHeaderBytes({ width: 128, height: 128 }));

    const lookup = await (await openTheme()).inspectAsset(assetPath('icons/music.png'));

    expect(lookup).toMatchObject({ status: 'found' });
  });

  describe.skipIf(!symbolicLinksAvailable)('symbolic links', () => {
    it('refuses a link that points outside the theme folder', async () => {
      const secret = join(outsideRoot, 'secret.png');
      await writeFile(secret, pngHeaderBytes({ width: 960, height: 512 }));
      await symlink(secret, join(themeRoot, 'bg1.png'));

      const lookup = await (await openTheme()).inspectAsset(assetPath('bg1.png'));

      expect(lookup).toEqual({
        status: 'unreadable',
        reason: 'it resolves to a location outside the theme folder',
      });
    });

    it('refuses a link that reaches outside through a linked subfolder', async () => {
      await writeFile(join(outsideRoot, 'secret.png'), pngHeaderBytes({ width: 8, height: 8 }));
      await symlink(outsideRoot, join(themeRoot, 'assets'));

      const lookup = await (await openTheme()).inspectAsset(assetPath('assets/secret.png'));

      expect(lookup).toMatchObject({ status: 'unreadable' });
    });

    it('follows a link that stays inside the theme folder', async () => {
      await writeAsset('real.png', pngHeaderBytes({ width: 22, height: 22 }));
      await symlink(join(themeRoot, 'real.png'), join(themeRoot, 'basePage.png'));

      const lookup = await (await openTheme()).inspectAsset(assetPath('basePage.png'));

      expect(lookup).toMatchObject({ status: 'found' });
    });

    it('refuses a manifest that is a link to a file outside the folder', async () => {
      await writeFile(join(outsideRoot, 'theme.xml'), MINIMAL_MANIFEST, 'utf-8');
      await symlink(join(outsideRoot, 'theme.xml'), join(themeRoot, 'theme.xml'));

      const manifest = await (await openTheme()).readManifest();

      expect(manifest.ok).toBe(false);
    });
  });

  it('confines a path even if an unvalidated one reaches the adapter', async () => {
    await writeFile(join(outsideRoot, 'secret.png'), pngHeaderBytes({ width: 8, height: 8 }));
    const folder = await openTheme();

    // The type system stops this at the boundary; the adapter must not depend on that alone.
    const unchecked = '../outside/secret.png' as ThemeAssetPath;

    expect(await folder.inspectAsset(unchecked)).toMatchObject({ status: 'unreadable' });
  });
});

describe('openAsset', () => {
  const writeAsset = (name: string, bytes: Uint8Array): Promise<void> =>
    writeFile(join(themeRoot, name), bytes);

  it('reads a file the theme references, byte for byte', async () => {
    const contents = pngHeaderBytes({ width: 960, height: 512 });
    await writeAsset('bg1.png', contents);

    const opened = await (await openTheme()).openAsset(assetPath('bg1.png'));

    expect(opened.ok && opened.value).toEqual(contents);
  });

  it('reads a file larger than the window it inspects headers through', async () => {
    const padded = new Uint8Array(200_000).fill(0x5a);
    padded.set(pngHeaderBytes({ width: 22, height: 22 }));
    await writeAsset('basePage.png', padded);

    const opened = await (await openTheme()).openAsset(assetPath('basePage.png'));

    expect(opened.ok && opened.value.byteLength).toBe(padded.byteLength);
    expect(opened.ok && opened.value).toEqual(padded);
  });

  it('reads an asset in a subfolder of the theme', async () => {
    await mkdir(join(themeRoot, 'icons'));
    await writeAsset(join('icons', 'music.png'), pngHeaderBytes({ width: 128, height: 128 }));

    const opened = await (await openTheme()).openAsset(assetPath('icons/music.png'));

    expect(opened.ok).toBe(true);
  });

  it('reports a file the theme references but does not contain', async () => {
    const opened = await (await openTheme()).openAsset(assetPath('absent.png'));

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe('missing');
  });

  it('refuses a directory used where a file belongs', async () => {
    await mkdir(join(themeRoot, 'icons'));

    const opened = await (await openTheme()).openAsset(assetPath('icons'));

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe('not-a-file');
  });

  it('refuses a file too large to be a theme asset, without reading it', async () => {
    // Sized rather than written: the ceiling is checked before any of the file is read.
    const handle = await open(join(themeRoot, 'BGM.at9'), 'w');
    await handle.truncate(MAX_THEME_ASSET_BYTES + 1);
    await handle.close();

    const opened = await (await openTheme()).openAsset(assetPath('BGM.at9'));

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe('too-large');
  });

  it('does not put the location of the file into the message shown to the user', async () => {
    const opened = await (await openTheme()).openAsset(assetPath('absent.png'));

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.message).not.toContain(workspace);
    expect(opened.error.message).not.toContain(tmpdir());
  });

  describe.skipIf(!symbolicLinksAvailable)('symbolic links', () => {
    it('refuses to read through a link that points outside the theme folder', async () => {
      const secret = join(outsideRoot, 'secret.png');
      await writeFile(secret, pngHeaderBytes({ width: 960, height: 512 }));
      await symlink(secret, join(themeRoot, 'bg1.png'));

      const opened = await (await openTheme()).openAsset(assetPath('bg1.png'));

      expect(opened.ok).toBe(false);
      if (opened.ok) return;
      expect(opened.error.code).toBe('escapes-theme');
    });

    it('follows a link that stays inside the theme folder', async () => {
      const contents = pngHeaderBytes({ width: 22, height: 22 });
      await writeAsset('real.png', contents);
      await symlink(join(themeRoot, 'real.png'), join(themeRoot, 'basePage.png'));

      const opened = await (await openTheme()).openAsset(assetPath('basePage.png'));

      expect(opened.ok && opened.value).toEqual(contents);
    });
  });

  it('confines a path even if an unvalidated one reaches the adapter', async () => {
    await writeFile(join(outsideRoot, 'secret.png'), pngHeaderBytes({ width: 8, height: 8 }));
    const folder = await openTheme();

    const unchecked = '../outside/secret.png' as ThemeAssetPath;

    expect(await folder.openAsset(unchecked)).toMatchObject({
      ok: false,
      error: { code: 'escapes-theme' },
    });
  });
});
