import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MediaDescriptor } from '@/domain/model/media';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { THEME_XML_FILE_NAME } from '@/domain/vita/theme-xml-schema';
import type { ThemeFolder } from '@/application/ports/theme-folder';
import { failure, success } from '@/domain/shared/result';
import type { ThemeAssetReadError } from '@/application/ports/theme-assets';
import type { AssetLookup } from '@/domain/validation/asset-catalog';
import { pngHeaderBytes, riffWaveBytes } from './binary-fixtures';
import { COMPLETE_MANIFEST } from './manifest-fixtures';
import { foundAsset } from './theme-fixtures';

/**
 * A theme folder that exists only in the test, so a use case can be exercised without a
 * filesystem. What the adapters do with real files is covered by their own tests.
 */

export const anImage = (width: number, height: number): AssetLookup =>
  foundAsset({
    kind: 'image',
    format: 'png',
    width,
    height,
    encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: false },
  });

/**
 * Every asset the complete manifest fixture references, sized to specification, so a test
 * only has to override the one file it is interested in.
 */
export const wellFormedAssets = (): Record<string, AssetLookup> => ({
  'bg1.png': anImage(960, 512),
  'bg2.png': anImage(960, 512),
  'bg1t.png': anImage(360, 192),
  'bg2t.png': anImage(360, 192),
  'BGM.at9': foundAsset({ kind: 'audio', format: 'at9', sampleRate: 48000, channelCount: 2 }),
  'icon_web.png': anImage(128, 128),
  'icon_settings.png': anImage(128, 128),
  'basePage.png': anImage(22, 22),
  'curPage.png': anImage(22, 22),
  'notices.png': anImage(120, 110),
  'notice.png': anImage(120, 110),
  'preview_home.png': anImage(480, 272),
  'preview_start.png': anImage(480, 272),
  'preview_thumbnail.png': anImage(226, 128),
  'lockpaper.png': anImage(960, 512),
});

/** Recognisable bytes that say which file they came from, so a copy can be traced. */
export const stubAssetContents = (path: string): Uint8Array =>
  new TextEncoder().encode(`contents of ${path}`);

export interface StubThemeFolderOptions {
  readonly assets?: Record<string, AssetLookup>;
  /** Bytes for particular files. Anything else that exists reads as `stubAssetContents`. */
  readonly contents?: Record<string, Uint8Array>;
  /** Files that pass inspection but cannot be read afterwards, as a vanishing file would. */
  readonly unreadable?: Record<string, ThemeAssetReadError>;
}

export const stubThemeFolder = (
  manifest: string,
  { assets = wellFormedAssets(), contents = {}, unreadable = {} }: StubThemeFolderOptions = {},
): ThemeFolder => ({
  readManifest: () => Promise.resolve(success(manifest)),
  inspectAsset: (path) => Promise.resolve(assets[path] ?? { status: 'missing' }),
  openAsset: (path: ThemeAssetPath) => {
    const unreadableReason = unreadable[path];
    if (unreadableReason !== undefined) {
      return Promise.resolve(failure(unreadableReason));
    }

    const override = contents[path];
    if (override !== undefined) {
      return Promise.resolve(success(override));
    }
    if (assets[path]?.status === 'found') {
      return Promise.resolve(success(stubAssetContents(path)));
    }

    const missing: ThemeAssetReadError = {
      code: 'missing',
      message: `The theme references "${path}", but that file is not in the theme folder.`,
    };
    return Promise.resolve(failure(missing));
  },
});

/**
 * Builds the files a theme folder holds on disk.
 *
 * Only container headers are written: the readers never look past them, so a test does not
 * need — and this repository does not carry — a real image or a real music track.
 */
export const bytesForMedia = (media: MediaDescriptor): Uint8Array => {
  switch (media.kind) {
    case 'image':
      return pngHeaderBytes({ width: media.width, height: media.height });
    case 'audio':
      return riffWaveBytes({
        atrac9: media.format === 'at9',
        sampleRate: media.sampleRate,
        channelCount: media.channelCount,
      });
    case 'unrecognized':
      return new TextEncoder().encode('not a theme asset');
  }
};

/** Writes a theme folder that validates cleanly, for tests that need a real one on disk. */
export const writeThemeFolder = async (
  root: string,
  manifest: string = COMPLETE_MANIFEST,
  assets: Record<string, AssetLookup> = wellFormedAssets(),
): Promise<void> => {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, THEME_XML_FILE_NAME), manifest, 'utf-8');

  for (const [path, lookup] of Object.entries(assets)) {
    if (lookup.status !== 'found') {
      continue;
    }
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytesForMedia(lookup.asset.media));
  }
};
