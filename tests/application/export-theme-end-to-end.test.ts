import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ThemeExportTarget } from '@/application/ports/theme-export-target';
import { exportThemeFolder } from '@/application/use-cases/export-theme-folder';
import { validateThemeFolder } from '@/application/use-cases/validate-theme-folder';
import type { ThemeFolder } from '@/application/ports/theme-folder';
import type { Result } from '@/domain/shared/result';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { openThemeFolder } from '@/infrastructure/filesystem/file-system-theme-folder';
import { themeXmlCodec } from '@/infrastructure/theme-xml/theme-xml-codec';
import { COMPLETE_MANIFEST } from '../support/manifest-fixtures';
import { wellFormedAssets, writeThemeFolder } from '../support/theme-folder-fixtures';
import { readZipArchive, zipEntry, zipEntryNames } from '../support/zip-reader';

/**
 * The export milestone from end to end: a real theme folder on disk, read through the
 * filesystem adapter, written out through the real targets. The layers are covered
 * separately; what this file is for is the guarantees that only hold once they are joined.
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

/** Checked with an independent implementation where the machine has one. */
const unzipAvailable = ((): boolean => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const codec = themeXmlCodec();

let workspace: string;
let source: string;
let destination: string;
let archive: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-end-to-end-'));
  source = join(workspace, 'source');
  destination = join(workspace, 'Exported');
  archive = join(workspace, 'Exported.zip');
  await writeThemeFolder(source);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const unwrap = <TValue>(result: Result<TValue, { message: string }>, what: string): TValue => {
  if (!result.ok) {
    throw new Error(`Expected to ${what}, but it failed: ${result.error.message}`);
  }
  return result.value;
};

const openSource = async (path = source): Promise<ThemeFolder> =>
  unwrap(await openThemeFolder(path), 'open the source theme');

const exportTo = async (target: ThemeExportTarget, path = source) =>
  exportThemeFolder({ folder: await openSource(path), codec, target });

const exportToFolder = async (sourcePath = source) =>
  exportTo(
    unwrap(await openFolderExportTarget(destination), 'open the destination folder'),
    sourcePath,
  );

const exportToArchive = async (sourcePath = source) =>
  exportTo(
    unwrap(await openArchiveExportTarget(archive), 'open the destination archive'),
    sourcePath,
  );

const filesUnder = async (root: string): Promise<readonly string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
};

const expectedFiles = (): readonly string[] =>
  ['theme.xml', ...Object.keys(wellFormedAssets())].sort();

describe('exporting a theme folder', () => {
  it('writes a folder holding the manifest and every file the theme uses', async () => {
    const outcome = await exportToFolder();

    expect(outcome.status).toBe('exported');
    expect(await filesUnder(destination)).toEqual(expectedFiles());
  });

  it('copies each file unchanged', async () => {
    await exportToFolder();

    expect(await readFile(join(destination, 'BGM.at9'))).toEqual(
      await readFile(join(source, 'BGM.at9')),
    );
  });

  it('exports only what the theme references, not whatever else is in the folder', async () => {
    await writeFile(join(source, 'working-notes.txt'), 'not part of the theme');
    await writeFile(join(source, 'bg1.xcf'), 'the original artwork');

    await exportToFolder();

    expect(await filesUnder(destination)).toEqual(expectedFiles());
  });

  it('produces a theme that validates exactly as the one it came from', async () => {
    const before = await validateThemeFolder({ folder: await openSource(), codec });
    await exportToFolder();
    const after = await validateThemeFolder({ folder: await openSource(destination), codec });

    expect(after.status).toBe('validated');
    if (after.status !== 'validated' || before.status !== 'validated') return;
    expect(after.project).toEqual(before.project);
    expect(after.report).toEqual(before.report);
  });

  it('can be exported again from what it exported, with the same result', async () => {
    await exportToFolder();
    const reExported = join(workspace, 'Exported again');

    const outcome = await exportThemeFolder({
      folder: await openSource(destination),
      codec,
      target: unwrap(await openFolderExportTarget(reExported), 'open the second destination'),
    });

    expect(outcome.status).toBe('exported');
    expect(await readFile(join(reExported, 'theme.xml'), 'utf-8')).toBe(
      await readFile(join(destination, 'theme.xml'), 'utf-8'),
    );
  });

  it('reports what it exported', async () => {
    const outcome = await exportToFolder();

    expect(outcome.status).toBe('exported');
    if (outcome.status !== 'exported') return;
    expect(outcome.summary.fileCount).toBe(expectedFiles().length);
    expect(outcome.summary.totalBytes).toBeGreaterThan(0);
  });

  it('keeps a file the theme puts in a subfolder where the manifest says it is', async () => {
    const nested = join(workspace, 'nested');
    await writeThemeFolder(nested, COMPLETE_MANIFEST.replace('icon_web.png', 'icons/web.png'), {
      ...wellFormedAssets(),
      'icons/web.png': wellFormedAssets()['icon_web.png']!,
    });

    const outcome = await exportToFolder(nested);

    expect(outcome.status).toBe('exported');
    expect(await filesUnder(destination)).toContain('icons/web.png');
  });
});

describe('exporting a theme folder as an archive', () => {
  it('writes an archive holding the manifest and every file the theme uses', async () => {
    const outcome = await exportToArchive();

    expect(outcome.status).toBe('exported');
    expect([...zipEntryNames(readZipArchive(await readFile(archive)))].sort()).toEqual(
      expectedFiles(),
    );
  });

  it('puts the manifest at the root of the archive, where theme repositories require it', async () => {
    await exportToArchive();

    const names = zipEntryNames(readZipArchive(await readFile(archive)));
    expect(names[0]).toBe('theme.xml');
    expect(names.every((name) => !name.startsWith('/'))).toBe(true);
  });

  it('stores each file byte for byte', async () => {
    await exportToArchive();

    const entry = zipEntry(readZipArchive(await readFile(archive)), 'bg1.png');
    expect(entry.contents).toEqual(new Uint8Array(await readFile(join(source, 'bg1.png'))));
  });

  it('writes the same archive every time, so a theme can be published reproducibly', async () => {
    await exportToArchive();
    const first = await readFile(archive);
    await unlink(archive);
    await exportToArchive();

    expect(await readFile(archive)).toEqual(first);
  });

  it.skipIf(!unzipAvailable)('writes an archive other tools accept', async () => {
    await exportToArchive();

    expect(() => execFileSync('unzip', ['-t', archive], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('a theme that must not be exported', () => {
  const expectNothingWritten = async (): Promise<void> => {
    expect(await readdir(workspace)).toEqual(['source']);
  };

  it('refuses a theme that is missing one of its files', async () => {
    await unlink(join(source, 'bg1.png'));

    const outcome = await exportToFolder();

    expect(outcome.status).toBe('blocked');
    if (outcome.status !== 'blocked') return;
    expect(outcome.report.issues.map((issue) => issue.code)).toContain('asset.missing');
    await expectNothingWritten();
  });

  it('refuses a theme whose manifest is not valid XML', async () => {
    await writeFile(join(source, 'theme.xml'), '<theme><HomeProperty></theme>', 'utf-8');

    const outcome = await exportToFolder();

    expect(outcome.status).toBe('unopenable');
    if (outcome.status !== 'unopenable') return;
    expect(outcome.error.code).toBe('malformed-xml');
    await expectNothingWritten();
  });

  it('refuses a folder that is not a theme at all', async () => {
    await unlink(join(source, 'theme.xml'));

    const outcome = await exportToFolder();

    expect(outcome.status).toBe('unopenable');
    if (outcome.status !== 'unopenable') return;
    expect(outcome.error.code).toBe('manifest-missing');
    await expectNothingWritten();
  });

  it('refuses a manifest that points outside the theme folder', async () => {
    await writeThemeFolder(
      source,
      COMPLETE_MANIFEST.replace('lockpaper.png', '../../../etc/passwd'),
    );

    const outcome = await exportToFolder();

    expect(outcome.status).toBe('blocked');
    if (outcome.status !== 'blocked') return;
    expect(outcome.report.issues.map((issue) => issue.code)).toContain(
      'manifest.unsafe-asset-path',
    );
    await expectNothingWritten();
  });

  it.skipIf(!symbolicLinksAvailable)(
    'refuses a theme whose file is a link to somewhere outside it',
    async () => {
      const outside = join(workspace, 'outside.png');
      await writeFile(outside, await readFile(join(source, 'bg1.png')));
      await unlink(join(source, 'bg1.png'));
      await symlink(outside, join(source, 'bg1.png'));

      const outcome = await exportToFolder();

      expect(outcome.status).toBe('blocked');
      if (outcome.status !== 'blocked') return;
      expect(outcome.report.issues.map((issue) => issue.code)).toContain('asset.unreadable');
      expect(await readdir(workspace)).toEqual(expect.arrayContaining(['source', 'outside.png']));
      expect(await readdir(workspace)).toHaveLength(2);
    },
  );

  it('leaves no trace of a failed export beside the destination', async () => {
    await unlink(join(source, 'BGM.at9'));

    const folderOutcome = await exportToFolder();
    const archiveOutcome = await exportToArchive();

    expect(folderOutcome.status).toBe('blocked');
    expect(archiveOutcome.status).toBe('blocked');
    await expectNothingWritten();
  });
});
