import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ThemeSnapshot } from '@/ipc';
import { validationReport } from '@/domain/validation/report';
import { HomeSection } from '@/presentation/sections/HomeSection';
import type { EditorActions } from '@/presentation/state/use-editor';
import { aThemeProject, assetPath } from '../support/theme-fixtures';

const actions = {} as EditorActions;

const markup = (thumbnail: string | null, generatedThumbnail: boolean): string => {
  const project = aThemeProject();
  const page = project.home.pages[0];
  if (page === undefined) throw new Error('Test project has no LiveArea page');
  const theme: ThemeSnapshot = {
    origin: 'project',
    label: 'Example',
    project: {
      ...project,
      home: {
        ...project.home,
        pages: [
          {
            ...page,
            background: assetPath('background-1.png'),
            thumbnail: thumbnail === null ? null : assetPath(thumbnail),
            generatedThumbnail,
          },
        ],
      },
    },
    report: validationReport([]),
    assets: [],
    canUndo: false,
    canRedo: false,
    revision: 0,
    assetRevision: 0,
    isDirty: false,
  };
  return renderToStaticMarkup(<HomeSection theme={theme} page={0} actions={actions} />);
};

describe('LiveArea page thumbnail controls', () => {
  const artwork = (html: string): string =>
    html.slice(html.indexOf('<div class="page-editor">'), html.indexOf('<div class="field-grid">'));

  it('shows one prominent background card with a compact generated thumbnail row', () => {
    const html = markup('background-thumbnail-1.png', true);
    const page = artwork(html);
    expect(page).toContain('class="asset-slot asset-slot-featured"');
    expect(page.match(/class="asset-slot(?:\s|")/g)).toHaveLength(1);
    expect(page).toContain('class="page-thumbnail"');
    expect(page).toContain('Generated automatically');
    expect(page).toContain('360 × 192');
    expect(page).toContain('Customize…');
    expect(page).not.toContain('page-thumbnail-details');
    expect(page).not.toContain('Use generated thumbnail');
  });

  it('makes a custom override obvious without rendering a second card', () => {
    const page = artwork(markup('my-thumbnail.png', false));
    expect(page.match(/class="asset-slot(?:\s|")/g)).toHaveLength(1);
    expect(page).toContain('Custom override');
    expect(page).toContain('Customize…');
    expect(page).toContain('Use generated thumbnail');
    expect(page).not.toContain('page-thumbnail-details');
  });

  it('offers generation for an imported page whose thumbnail is missing', () => {
    const page = artwork(markup(null, false));
    expect(page).toContain('Not set');
    expect(page).toContain('Use generated thumbnail');
  });
});
