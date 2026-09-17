import { describe, expect, it } from 'vitest';
import {
  generatablePreviews,
  previewAssetSlot,
  previewSource,
  withGeneratedPreview,
} from '@/domain/editing/preview-provenance';
import { withAssetAtSlot } from '@/domain/editing/theme-asset-slot';
import { applyThemeEdit } from '@/domain/editing/theme-edit';
import { THEME_PREVIEW_KINDS } from '@/domain/vita/theme-previews';
import { aThemeMetadata, aThemeProject, assetPath } from '../support/theme-fixtures';

/**
 * Whose picture is in a preview slot.
 *
 * The rule the whole feature rests on is here: a preview somebody supplied is never replaced
 * on the application's initiative. That holds because marking a slot custom is what *every*
 * ordinary way of filling it does, and generation is the only thing that says otherwise.
 */

const withoutPreviews = aThemeProject({
  metadata: aThemeMetadata({
    homePreview: null,
    startScreenPreview: null,
    packageThumbnail: null,
  }),
});

describe('where a preview came from', () => {
  it('is missing while the slot is empty', () => {
    for (const kind of THEME_PREVIEW_KINDS) {
      expect(previewSource(withoutPreviews, kind)).toBe('missing');
    }
  });

  it('is generated once the application has drawn one', () => {
    const drawn = withGeneratedPreview(
      withoutPreviews,
      'homePreview',
      assetPath('preview-home.png'),
    );

    expect(previewSource(drawn, 'homePreview')).toBe('generated');
    expect(drawn.metadata.homePreview).toBe('preview-home.png');
  });

  it('is custom for a preview that came with the theme', () => {
    expect(previewSource(aThemeProject(), 'packageThumbnail')).toBe('custom');
  });

  it('becomes custom the moment somebody puts their own picture in the slot', () => {
    const drawn = withGeneratedPreview(
      withoutPreviews,
      'homePreview',
      assetPath('preview-home.png'),
    );
    const chosen = withAssetAtSlot(drawn, previewAssetSlot('homePreview'), assetPath('mine.png'));

    expect(previewSource(chosen, 'homePreview')).toBe('custom');
  });

  it('goes back to missing when the slot is emptied', () => {
    const drawn = withGeneratedPreview(
      withoutPreviews,
      'homePreview',
      assetPath('preview-home.png'),
    );
    const cleared = applyThemeEdit(drawn, {
      kind: 'clear-asset',
      slot: previewAssetSlot('homePreview'),
    });

    expect(cleared.ok && previewSource(cleared.value, 'homePreview')).toBe('missing');
    expect(cleared.ok && cleared.value.metadata.generatedPreviews.size).toBe(0);
  });

  it('is decided for each preview on its own', () => {
    const drawn = withGeneratedPreview(
      withoutPreviews,
      'homePreview',
      assetPath('preview-home.png'),
    );

    expect(previewSource(drawn, 'startScreenPreview')).toBe('missing');
    expect(previewSource(drawn, 'packageThumbnail')).toBe('missing');
  });
});

describe('which previews may be drawn without asking', () => {
  it('is all of them while the theme has none', () => {
    expect(generatablePreviews(withoutPreviews)).toEqual([...THEME_PREVIEW_KINDS]);
  });

  it('still covers one the application drew earlier', () => {
    const drawn = withGeneratedPreview(
      withoutPreviews,
      'homePreview',
      assetPath('preview-home.png'),
    );

    expect(generatablePreviews(drawn)).toContain('homePreview');
  });

  it('leaves out a picture somebody supplied', () => {
    const chosen = withAssetAtSlot(
      withoutPreviews,
      previewAssetSlot('startScreenPreview'),
      assetPath('mine.png'),
    );

    expect(generatablePreviews(chosen)).toEqual(['homePreview', 'packageThumbnail']);
  });

  it('is empty for a theme whose previews all came with it', () => {
    expect(generatablePreviews(aThemeProject())).toEqual([]);
  });
});

describe('the slot a preview lives in', () => {
  it('is named after the preview itself, so the two cannot drift apart', () => {
    for (const kind of THEME_PREVIEW_KINDS) {
      expect(previewAssetSlot(kind)).toEqual({ kind });
    }
  });
});
