import { describe, expect, it } from 'vitest';
import {
  compositionImages,
  previewComposition,
  type CompositionLayer,
  type PreviewComposition,
} from '@/domain/editing/preview-composition';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import type { ThemeProject } from '@/domain/model/theme-project';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import { HOME_APP_SLOT_IDS } from '@/domain/vita/home-app-slots';
import {
  VITA_INFORMATION_BAR_HEIGHT,
  VITA_SCREEN_HEIGHT,
  VITA_SCREEN_WIDTH,
  VITA_WALLPAPER_HEIGHT,
} from '@/domain/vita/display';
import { THEME_PREVIEW_KINDS } from '@/domain/vita/theme-previews';
import {
  aHomeScreen,
  aLiveAreaPage,
  anInformationBar,
  aStartScreen,
  aThemeMetadata,
  aThemeProject,
  assetPath,
  color,
} from '../support/theme-fixtures';

/**
 * What a generated preview is a picture of.
 *
 * Every assertion here is about what the composition *says*, because that is where the
 * decisions are: which artwork a preview is drawn from, what is left out because it is the
 * console's rather than the theme's, and whether what comes out is the shape the format
 * expects. Nothing here draws anything.
 */

const aThemeWithArtwork = (overrides: Partial<ThemeProject> = {}): ThemeProject =>
  aThemeProject({
    metadata: aThemeMetadata({
      homePreview: null,
      startScreenPreview: null,
      packageThumbnail: null,
    }),
    home: aHomeScreen({
      pages: [aLiveAreaPage()],
      basePageIndicator: null,
      currentPageIndicator: null,
    }),
    ...overrides,
  });

const composed = (
  kind: (typeof THEME_PREVIEW_KINDS)[number],
  project: ThemeProject,
): PreviewComposition => {
  const composition = previewComposition(kind, project);
  if (!composition.ok) {
    throw new Error(`the composition was refused: ${composition.error}`);
  }
  return composition.value;
};

const imageLayers = (
  composition: PreviewComposition,
): readonly Extract<CompositionLayer<ThemeAssetPath>, { kind: 'image' }>[] =>
  composition.layers.flatMap((layer) => (layer.kind === 'image' ? [layer] : []));

const fillLayers = (
  composition: PreviewComposition,
): readonly Extract<CompositionLayer<ThemeAssetPath>, { kind: 'fill' }>[] =>
  composition.layers.flatMap((layer) => (layer.kind === 'fill' ? [layer] : []));

describe('the shape of every preview', () => {
  it('is drawn on a canvas with the proportions the specification asks for', () => {
    // The composer scales the canvas to the target, and a canvas of another shape would be
    // distorted by that. This is the check that keeps the two in step.
    for (const kind of THEME_PREVIEW_KINDS) {
      const composition = composed(kind, aThemeWithArtwork());
      const spec = imageAssetSpec(kind);

      expect(composition.width / composition.height).toBeCloseTo(spec.width / spec.height, 6);
    }
  });

  it('starts from an opaque black canvas, which is what the console composites over', () => {
    for (const kind of THEME_PREVIEW_KINDS) {
      const first = composed(kind, aThemeWithArtwork()).layers[0];

      expect(first).toEqual({
        kind: 'fill',
        rect: expect.objectContaining({ x: 0, y: 0 }) as unknown,
        color: { red: 0, green: 0, blue: 0, alpha: 255 },
      });
    }
  });
});

describe('the home screen preview', () => {
  it('is the console screen, with the wallpaper below the information bar', () => {
    const composition = composed('homePreview', aThemeWithArtwork());

    expect(composition.width).toBe(VITA_SCREEN_WIDTH);
    expect(composition.height).toBe(VITA_SCREEN_HEIGHT);
    expect(imageLayers(composition)[0]).toMatchObject({
      image: 'bg1.png',
      required: true,
      rect: {
        x: 0,
        y: VITA_INFORMATION_BAR_HEIGHT,
        width: VITA_SCREEN_WIDTH,
        height: VITA_WALLPAPER_HEIGHT,
      },
    });
  });

  it('is drawn from the first LiveArea page, whatever the others hold', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({
        pages: [
          aLiveAreaPage({ background: assetPath('first.png') }),
          aLiveAreaPage({ background: assetPath('second.png') }),
        ],
        basePageIndicator: null,
        currentPageIndicator: null,
      }),
    });

    expect(compositionImages(composed('homePreview', project))).toEqual(['first.png']);
  });

  it('is refused when the page it would be drawn from has no background', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({ pages: [aLiveAreaPage({ background: null })] }),
    });

    expect(previewComposition('homePreview', project)).toEqual({
      ok: false,
      error: 'no-home-artwork',
    });
  });

  it('colours the information bar strip when the theme colours it', () => {
    const project = aThemeWithArtwork({
      informationBar: anInformationBar({ barColor: color('FF3366') }),
    });

    expect(fillLayers(composed('homePreview', project))).toContainEqual({
      kind: 'fill',
      rect: { x: 0, y: 0, width: VITA_SCREEN_WIDTH, height: VITA_INFORMATION_BAR_HEIGHT },
      color: { red: 0xff, green: 0x33, blue: 0x66, alpha: 0xff },
    });
  });

  it('leaves the strip black when the theme does not, rather than guessing at the console', () => {
    const project = aThemeWithArtwork({
      informationBar: anInformationBar({ barColor: null }),
    });

    // Only the base is a fill: nothing was invented for the bar.
    expect(fillLayers(composed('homePreview', project))).toHaveLength(1);
  });

  it('draws the icons the theme replaces, at the size the format gives them', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({
        pages: [aLiveAreaPage()],
        basePageIndicator: null,
        currentPageIndicator: null,
        appIcons: new Map([
          ['settings', assetPath('icon-settings.png')],
          ['browser', assetPath('icon-browser.png')],
        ]),
      }),
    });

    const icons = imageLayers(composed('homePreview', project)).filter((layer) =>
      layer.image.startsWith('icon-'),
    );
    const size = imageAssetSpec('appIcon').width;

    expect(icons).toHaveLength(2);
    // In the format layer's order, not the order the map happens to hold them in.
    expect(icons.map((layer) => layer.image)).toEqual(['icon-browser.png', 'icon-settings.png']);
    for (const icon of icons) {
      expect(icon.rect.width).toBe(size);
      expect(icon.rect.height).toBe(size);
      expect(icon.required).toBe(false);
    }
  });

  it('draws nothing at all for a slot the theme leaves to the console', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({
        pages: [aLiveAreaPage()],
        basePageIndicator: null,
        currentPageIndicator: null,
      }),
    });

    // The editor draws a neutral mark for an unthemed icon; a preview must not, because a
    // preview has no way of saying that the console will draw its own there.
    expect(compositionImages(composed('homePreview', project))).toEqual(['bg1.png']);
  });

  it('keeps every icon inside the screen', () => {
    const everySlot = aThemeWithArtwork({
      home: aHomeScreen({
        pages: [aLiveAreaPage()],
        basePageIndicator: null,
        currentPageIndicator: null,
        appIcons: new Map(
          HOME_APP_SLOT_IDS.map(
            (slot, index) => [slot, assetPath(`icon-${String(index)}.png`)] as const,
          ),
        ),
      }),
    });

    for (const layer of imageLayers(composed('homePreview', everySlot))) {
      expect(layer.rect.x).toBeGreaterThanOrEqual(0);
      expect(layer.rect.y).toBeGreaterThanOrEqual(0);
      expect(layer.rect.x + layer.rect.width).toBeLessThanOrEqual(VITA_SCREEN_WIDTH);
      expect(layer.rect.y + layer.rect.height).toBeLessThanOrEqual(VITA_SCREEN_HEIGHT);
    }
  });

  it('draws one page dot per LiveArea page, from the theme’s own dots', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({
        pages: [aLiveAreaPage(), aLiveAreaPage(), aLiveAreaPage()],
        basePageIndicator: assetPath('page-dot.png'),
        currentPageIndicator: assetPath('page-dot-current.png'),
      }),
    });

    const dots = imageLayers(composed('homePreview', project)).filter((layer) =>
      layer.image.startsWith('page-dot'),
    );

    expect(dots.map((layer) => layer.image)).toEqual([
      'page-dot-current.png',
      'page-dot.png',
      'page-dot.png',
    ]);
    expect(dots.every((dot) => dot.rect.width === imageAssetSpec('pageIndicator').width)).toBe(
      true,
    );
  });

  it('draws no page dots when the theme supplies none', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({
        pages: [aLiveAreaPage(), aLiveAreaPage()],
        basePageIndicator: null,
        currentPageIndicator: null,
      }),
    });

    expect(compositionImages(composed('homePreview', project))).toEqual(['bg1.png']);
  });
});

describe('the lock screen preview', () => {
  it('is the lock screen wallpaper under the information bar', () => {
    const composition = composed('startScreenPreview', aThemeWithArtwork());

    expect(imageLayers(composition)).toHaveLength(1);
    expect(imageLayers(composition)[0]).toMatchObject({
      image: 'lockpaper.png',
      required: true,
      rect: { y: VITA_INFORMATION_BAR_HEIGHT, height: VITA_WALLPAPER_HEIGHT },
    });
  });

  it('is refused when the theme has no lock screen wallpaper', () => {
    const project = aThemeWithArtwork({ startScreen: aStartScreen({ background: null }) });

    expect(previewComposition('startScreenPreview', project)).toEqual({
      ok: false,
      error: 'no-lock-screen-artwork',
    });
  });

  it('draws no notification panel, whatever the theme colours it', () => {
    const project = aThemeWithArtwork({
      startScreen: aStartScreen({
        notificationBackgroundColor: color('64FFFFFF'),
        notificationBorderColor: color('FFFFFFFF'),
      }),
      informationBar: anInformationBar({ barColor: null }),
    });

    // The console shows the panel only when there is a notification, and it is mostly the
    // text in it; an empty rectangle would look like a fault in the theme.
    expect(fillLayers(composed('startScreenPreview', project))).toHaveLength(1);
  });
});

describe('the theme thumbnail', () => {
  it('is the specification’s own size, filled from the first page’s background', () => {
    const composition = composed('packageThumbnail', aThemeWithArtwork());
    const spec = imageAssetSpec('packageThumbnail');

    expect(composition.width).toBe(spec.width);
    expect(composition.height).toBe(spec.height);
    expect(imageLayers(composition)[0]).toMatchObject({
      image: 'bg1.png',
      required: true,
      // Cover keeps the artwork's proportions and crops what hangs over, rather than
      // pulling a wallpaper into the shape of a thumbnail.
      fit: 'cover',
      rect: { x: 0, y: 0, width: spec.width, height: spec.height },
    });
  });

  it('falls back to the lock screen when no page has a background', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({ pages: [aLiveAreaPage({ background: null })] }),
    });

    expect(compositionImages(composed('packageThumbnail', project))).toEqual(['lockpaper.png']);
  });

  it('is refused when the theme has no artwork at all', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({ pages: [aLiveAreaPage({ background: null })] }),
      startScreen: aStartScreen({ background: null }),
    });

    expect(previewComposition('packageThumbnail', project)).toEqual({
      ok: false,
      error: 'no-artwork',
    });
  });
});

describe('the files a composition needs', () => {
  it('names each of them once, in the order they are drawn', () => {
    const project = aThemeWithArtwork({
      home: aHomeScreen({
        pages: [aLiveAreaPage(), aLiveAreaPage()],
        basePageIndicator: assetPath('page-dot.png'),
        currentPageIndicator: assetPath('page-dot.png'),
        appIcons: new Map([['settings', assetPath('icon-settings.png')]]),
      }),
    });

    expect(compositionImages(composed('homePreview', project))).toEqual([
      'bg1.png',
      'icon-settings.png',
      'page-dot.png',
    ]);
  });
});
