import { describe, expect, it, vi } from 'vitest';
import type { ThemeFolder } from '@/application/ports/theme-folder';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { validateThemeFolder } from '@/application/use-cases/validate-theme-folder';
import { failure } from '@/domain/shared/result';
import type { AssetLookup } from '@/domain/validation/asset-catalog';
import { VALIDATION_CODES } from '@/domain/validation/issue';
import { errorsIn, hasErrors, isExportable, warningsIn } from '@/domain/validation/report';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { COMPLETE_MANIFEST } from '../support/manifest-fixtures';
import { codesIn } from '../support/theme-fixtures';
import { stubThemeFolder, wellFormedAssets } from '../support/theme-folder-fixtures';

const stubFolder = (
  manifest: string,
  assets: Record<string, AssetLookup> = wellFormedAssets(),
): ThemeFolder => stubThemeFolder(manifest, { assets });

describe('validateThemeFolder', () => {
  const codec = themeXmlCodec();

  it('reports a theme whose files all match the specification as exportable', async () => {
    const outcome = await validateThemeFolder({ folder: stubFolder(COMPLETE_MANIFEST), codec });

    expect(outcome.status).toBe('validated');
    if (outcome.status !== 'validated') return;
    expect(errorsIn(outcome.report)).toEqual([]);
    expect(isExportable(outcome.report)).toBe(true);
    expect(outcome.project.metadata.title.defaultValue).toBe('Example Theme');
  });

  it('still points out what the theme leaves unstyled', async () => {
    // The fixture replaces two of the seventeen system icons, which is worth saying but is
    // not a reason to stop the author exporting.
    const outcome = await validateThemeFolder({ folder: stubFolder(COMPLETE_MANIFEST), codec });

    expect(outcome.status).toBe('validated');
    if (outcome.status !== 'validated') return;
    expect(codesIn(outcome.report)).toEqual([VALIDATION_CODES.homeIconSetIncomplete]);
    expect(warningsIn(outcome.report)).toHaveLength(1);
  });

  it('gives up when the manifest cannot be read', async () => {
    const folder: ThemeFolder = {
      ...stubFolder(''),
      readManifest: () =>
        Promise.resolve(failure({ code: 'manifest-missing' as const, message: 'No theme.xml.' })),
    };

    const outcome = await validateThemeFolder({ folder, codec });

    expect(outcome).toEqual({
      status: 'unopenable',
      error: { code: 'manifest-missing', message: 'No theme.xml.' },
    });
  });

  it('gives up when the manifest is not valid XML', async () => {
    const outcome = await validateThemeFolder({
      folder: stubFolder('<theme><HomeProperty></theme>'),
      codec,
    });

    expect(outcome.status).toBe('unopenable');
    if (outcome.status !== 'unopenable') return;
    expect(outcome.error.code).toBe('malformed-xml');
  });

  it('presents manifest problems and rule violations as one list', async () => {
    const manifest = COMPLETE_MANIFEST.replace(
      '<m_dateColor>00D1FF</m_dateColor>',
      '<m_dateColor>nope</m_dateColor>',
    );
    const assets = wellFormedAssets();
    delete assets['icon_web.png'];

    const outcome = await validateThemeFolder({ folder: stubFolder(manifest, assets), codec });

    expect(outcome.status).toBe('validated');
    if (outcome.status !== 'validated') return;
    expect(codesIn(outcome.report)).toEqual(
      expect.arrayContaining([
        VALIDATION_CODES.manifestInvalidColor,
        VALIDATION_CODES.assetMissing,
      ]),
    );
    expect(hasErrors(outcome.report)).toBe(true);
  });

  it('lists manifest problems before the rule violations', async () => {
    const manifest = COMPLETE_MANIFEST.replace('01.00</m_contentVer>', '1.0</m_contentVer>');
    const assets = wellFormedAssets();
    delete assets['bg1.png'];

    const outcome = await validateThemeFolder({ folder: stubFolder(manifest, assets), codec });

    expect(outcome.status).toBe('validated');
    if (outcome.status !== 'validated') return;
    const codes = codesIn(outcome.report);
    expect(codes.indexOf(VALIDATION_CODES.manifestInvalidContentVersion)).toBeLessThan(
      codes.indexOf(VALIDATION_CODES.assetMissing),
    );
  });

  it('inspects a file shared by several fields only once', async () => {
    const manifest = COMPLETE_MANIFEST.replaceAll('bg2.png', 'bg1.png');
    const folder = stubFolder(manifest);
    const inspectAsset = vi.fn((path: ThemeAssetPath) => folder.inspectAsset(path));

    await validateThemeFolder({ folder: { ...folder, inspectAsset }, codec });

    const inspected = inspectAsset.mock.calls.map(([path]) => path);
    expect(inspected.filter((path) => path === 'bg1.png')).toHaveLength(1);
    expect(new Set(inspected).size).toBe(inspected.length);
  });

  it('never asks for a file the theme does not reference', async () => {
    const folder = stubFolder(COMPLETE_MANIFEST);
    const inspectAsset = vi.fn((path: ThemeAssetPath) => folder.inspectAsset(path));

    await validateThemeFolder({ folder: { ...folder, inspectAsset }, codec });

    const inspected = new Set(inspectAsset.mock.calls.map(([path]) => String(path)));
    expect(inspected.has('theme.xml')).toBe(false);
    expect(inspected.size).toBe(Object.keys(wellFormedAssets()).length);
  });
});
