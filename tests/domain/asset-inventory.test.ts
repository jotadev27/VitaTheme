import { describe, expect, it } from 'vitest';
import { emptyAssetCatalog } from '@/domain/validation/asset-catalog';
import { summarizeThemeAssets } from '@/domain/validation/asset-inventory';
import {
  aCatalog,
  aHomeScreen,
  aLiveAreaPage,
  anAssetlessThemeProject,
  assetPath,
  aThemeProject,
  foundAsset,
} from '../support/theme-fixtures';

const anImage = foundAsset(
  { kind: 'image', format: 'png', width: 960, height: 512, encoding: null },
  2048,
);

/** A theme whose only file is the first page's background, so a summary is unambiguous. */
const aSingleAssetProject = () =>
  anAssetlessThemeProject({
    home: aHomeScreen({
      pages: [aLiveAreaPage({ thumbnail: null })],
      basePageIndicator: null,
      currentPageIndicator: null,
    }),
  });

describe('summarizeThemeAssets', () => {
  it('lists each file once, in the order the theme declares them', () => {
    const summaries = summarizeThemeAssets(aThemeProject(), emptyAssetCatalog());

    expect(summaries.map((summary) => summary.path)).toEqual([
      'bg1.png',
      'bg1t.png',
      'basePage.png',
      'curPage.png',
      'notices.png',
      'notice.png',
      'lockpaper.png',
      'preview_home.png',
      'preview_start.png',
      'preview_thumbnail.png',
    ]);
  });

  it('collects every role a shared file plays', () => {
    const shared = assetPath('shared.png');
    const project = anAssetlessThemeProject({
      home: aHomeScreen({
        pages: [aLiveAreaPage({ background: shared, thumbnail: shared })],
        basePageIndicator: shared,
        currentPageIndicator: null,
      }),
    });

    const summaries = summarizeThemeAssets(project, emptyAssetCatalog());

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.usages).toEqual([
      'liveAreaBackground',
      'liveAreaThumbnail',
      'pageIndicator',
    ]);
    expect(summaries[0]?.locations).toEqual([
      'home.pages[0].background',
      'home.pages[0].thumbnail',
      'home.basePageIndicator',
    ]);
  });

  it('carries what was found for the file, so a caller does not inspect it again', () => {
    const summaries = summarizeThemeAssets(aSingleAssetProject(), aCatalog({ 'bg1.png': anImage }));

    expect(summaries[0]?.lookup).toEqual(anImage);
  });

  it('reports a file that is not there rather than leaving it out', () => {
    const summaries = summarizeThemeAssets(aSingleAssetProject(), emptyAssetCatalog());

    expect(summaries[0]).toMatchObject({ path: 'bg1.png', lookup: { status: 'missing' } });
  });

  it('has nothing to list for a theme that refers to no files', () => {
    expect(summarizeThemeAssets(anAssetlessThemeProject(), emptyAssetCatalog())).toEqual([]);
  });
});
