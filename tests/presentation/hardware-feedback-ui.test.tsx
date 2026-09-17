import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { withAssetAtSlot } from '@/domain/editing/theme-asset-slot';
import { withGeneratedPreview } from '@/domain/editing/preview-provenance';
import { applyThemeEdit } from '@/domain/editing/theme-edit';
import { newThemeProject, type ThemeProject } from '@/domain/model/theme-project';
import { summarizeThemeAssets } from '@/domain/validation/asset-inventory';
import { validationReport } from '@/domain/validation/report';
import type { ThemeSnapshot } from '@/ipc';
import { ThemeList } from '@/presentation/preview/ThemeList';
import { OverviewSection } from '@/presentation/sections/OverviewSection';
import { HomeSection } from '@/presentation/sections/HomeSection';
import { BackgroundMusicControl } from '@/presentation/components/BackgroundMusicControl';
import type { EditorActions } from '@/presentation/state/use-editor';
import { assetPath, foundAsset } from '../support/theme-fixtures';

const actions = {} as EditorActions;
const base = (): ThemeProject => newThemeProject({ title: 'Hardware Test', provider: 'Author' });
const snapshot = (project: ThemeProject): ThemeSnapshot => ({
  origin: 'draft',
  label: 'Hardware Test',
  project,
  report: validationReport([]),
  assets: summarizeThemeAssets(project, {
    lookup: (path) =>
      path.endsWith('.at9')
        ? foundAsset({ kind: 'audio', format: 'at9', sampleRate: 48000, channelCount: 2 }, 4096)
        : foundAsset(
            { kind: 'image', format: 'png', width: 226, height: 128, encoding: null },
            2048,
          ),
  }),
  canUndo: false,
  canRedo: false,
  revision: 1,
  assetRevision: 1,
  isDirty: false,
});

describe('hardware-feedback editor surfaces', () => {
  it('makes a missing thumbnail editable without app-branding fallback', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeList, { theme: snapshot(base()), actions }),
    );
    expect(html).toContain('Missing theme thumbnail');
    expect(html).toContain('Generate');
    expect(html).toContain('Replace');
    expect(html).toContain('Theme name');
    expect(html).toContain('Author');
    expect(html).not.toContain('vitatheme-logo');
  });

  it('distinguishes custom from generated theme artwork using the authoritative slot', () => {
    const custom = withAssetAtSlot(
      base(),
      { kind: 'packageThumbnail' },
      assetPath('author-thumbnail.png'),
    );
    const generated = withGeneratedPreview(
      base(),
      'packageThumbnail',
      assetPath('generated-thumbnail.png'),
    );
    const customHtml = renderToStaticMarkup(
      createElement(ThemeList, { theme: snapshot(custom), actions }),
    );
    const generatedHtml = renderToStaticMarkup(
      createElement(ThemeList, { theme: snapshot(generated), actions }),
    );
    expect(customHtml).toContain('author-thumbnail.png');
    expect(customHtml).toContain('Custom');
    expect(generatedHtml).toContain('generated-thumbnail.png');
    expect(generatedHtml).toContain('Generated');
    expect(generatedHtml).toContain('Regenerate');
    expect(customHtml).not.toContain('vitatheme-logo');
  });

  it('shows the same metadata in Theme List and Overview, with Translations last', () => {
    const changed = applyThemeEdit(base(), {
      kind: 'set-localized-default',
      field: 'title',
      value: 'New Name',
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const theme = snapshot(changed.value);
    const list = renderToStaticMarkup(createElement(ThemeList, { theme, actions }));
    const overview = renderToStaticMarkup(createElement(OverviewSection, { theme, actions }));
    expect(list).toContain('value="New Name"');
    expect(overview).toContain('value="New Name"');
    expect(overview.indexOf('Translations')).toBeGreaterThan(overview.indexOf('Contents'));
    expect(overview.indexOf('Translations')).toBeGreaterThan(overview.indexOf('Preview images'));
  });

  it('describes absent music and icons as console behavior, not broken assets', () => {
    const theme = snapshot(base());
    const music = renderToStaticMarkup(createElement(BackgroundMusicControl, { theme, actions }));
    const home = renderToStaticMarkup(createElement(HomeSection, { theme, actions, page: 0 }));
    expect(music).toContain('Console default');
    expect(music).toContain('No music file is included');
    expect(home).toContain('Provided by the PS Vita');
    expect(home).toContain('Console default');
  });

  it('shows a custom AT9 and a clear path back to console default', () => {
    const project = withAssetAtSlot(base(), { kind: 'backgroundMusic' }, assetPath('music.at9'));
    const html = renderToStaticMarkup(
      createElement(BackgroundMusicControl, { theme: snapshot(project), actions }),
    );
    expect(html).toContain('music.at9');
    expect(html).toContain('AT9');
    expect(html).toContain('Replace');
    expect(html).toContain('Clear · use console default');
  });
});
