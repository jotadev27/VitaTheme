import type { ThemeAssetPath } from '../model/theme-asset-path';
import type { ThemeProject } from '../model/theme-project';

export type PageThumbnailSource = 'missing' | 'generated' | 'custom';

export const pageThumbnailSource = (project: ThemeProject, page: number): PageThumbnailSource => {
  const current = project.home.pages[page];
  if (current?.thumbnail === undefined || current.thumbnail === null) return 'missing';
  return current.generatedThumbnail ? 'generated' : 'custom';
};

export const withGeneratedPageThumbnail = (
  project: ThemeProject,
  page: number,
  path: ThemeAssetPath,
): ThemeProject => ({
  ...project,
  home: {
    ...project.home,
    pages: project.home.pages.map((current, index) =>
      index === page ? { ...current, thumbnail: path, generatedThumbnail: true } : current,
    ),
  },
});
