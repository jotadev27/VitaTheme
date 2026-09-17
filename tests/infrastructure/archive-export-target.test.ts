import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ThemeExportFailure,
  ThemeExportTarget,
} from '@/application/ports/theme-export-target';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { openArchiveExportTarget } from '@/infrastructure/export/archive-export-target';
import { assetPath } from '../support/theme-fixtures';
import { readZipArchive, zipEntryNames, zipEntryText } from '../support/zip-reader';

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

let workspace: string;
let destination: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-archive-'));
  destination = join(workspace, 'MyTheme.zip');
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const openTarget = async (path = destination, overwrite = false): Promise<ThemeExportTarget> => {
  const opened = await openArchiveExportTarget(path, { overwrite });
  if (!opened.ok) {
    throw new Error(`Expected the target to open, but it failed: ${opened.error.message}`);
  }
  return opened.value;
};

const failureOpening = async (path: string, overwrite = false): Promise<ThemeExportFailure> => {
  const opened = await openArchiveExportTarget(path, { overwrite });
  if (opened.ok) {
    await opened.value.discard();
    throw new Error('Expected opening the target to fail, but it succeeded');
  }
  return opened.error;
};

const writeCompleteTheme = async (target: ThemeExportTarget): Promise<void> => {
  await target.writeManifest(bytes('<theme />'));
  await target.writeAsset(assetPath('bg1.png'), bytes('background'));
  await target.writeAsset(assetPath('icons/music.png'), bytes('icon'));
};

const readArchive = async (path = destination) => readZipArchive(await readFile(path));

describe('openArchiveExportTarget', () => {
  it('writes an archive holding the manifest and every asset', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);

    expect(await target.commit()).toMatchObject({ ok: true });

    const archive = await readArchive();
    expect(zipEntryNames(archive)).toEqual(['theme.xml', 'bg1.png', 'icons/music.png']);
    expect(zipEntryText(archive, 'theme.xml')).toBe('<theme />');
    expect(zipEntryText(archive, 'icons/music.png')).toBe('icon');
  });

  it('puts the manifest at the root of the archive, where theme tools look for it', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);
    await target.commit();

    expect(zipEntryNames(await readArchive())[0]).toBe('theme.xml');
  });

  it('puts nothing at the destination until the archive is committed', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);

    expect(await readdir(workspace)).not.toContain('MyTheme.zip');

    await target.commit();
    expect(await readdir(workspace)).toContain('MyTheme.zip');
  });

  it('leaves nothing behind when the archive is discarded', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);

    await target.discard();

    expect(await readdir(workspace)).toEqual([]);
  });

  it('leaves no working files beside the archive once it is committed', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);
    await target.commit();

    expect(await readdir(workspace)).toEqual(['MyTheme.zip']);
  });

  it('refuses a destination that is already taken', async () => {
    await writeFile(destination, 'an older archive');

    expect(await failureOpening(destination)).toMatchObject({ code: 'destination-exists' });
  });

  it('replaces an existing archive only when asked to', async () => {
    await writeFile(destination, 'an older archive');

    const target = await openTarget(destination, true);
    await writeCompleteTheme(target);
    expect(await target.commit()).toMatchObject({ ok: true });

    expect(zipEntryNames(await readArchive())).toContain('theme.xml');
    expect(await readdir(workspace)).toEqual(['MyTheme.zip']);
  });

  it('keeps the previous archive intact while the new one is being written', async () => {
    await writeFile(destination, 'an older archive');

    const target = await openTarget(destination, true);
    await writeCompleteTheme(target);

    expect(await readFile(destination, 'utf-8')).toBe('an older archive');
  });

  it('refuses to replace a folder with an archive', async () => {
    await mkdir(destination);

    expect(await failureOpening(destination, true)).toMatchObject({
      code: 'destination-invalid',
    });
  });

  it('refuses a destination whose parent folder does not exist', async () => {
    expect(await failureOpening(join(workspace, 'missing', 'MyTheme.zip'))).toMatchObject({
      code: 'destination-invalid',
    });
  });

  it('abandons the archive when an entry is refused, rather than writing part of a theme', async () => {
    const target = await openTarget();
    await target.writeManifest(bytes('<theme />'));

    const escaping = '../escaped.png' as ThemeAssetPath;
    const written = await target.writeAsset(escaping, bytes('payload'));

    expect(written).toMatchObject({ ok: false, error: { code: 'unsafe-asset-path' } });
    expect(await readdir(workspace)).toEqual([]);
  });

  it('refuses to write the same file twice, which would hide one of them', async () => {
    const target = await openTarget();
    await target.writeAsset(assetPath('bg1.png'), bytes('first'));

    expect(await target.writeAsset(assetPath('bg1.png'), bytes('second'))).toMatchObject({
      ok: false,
      error: { code: 'duplicate-file' },
    });
  });

  it('refuses to write anything once the archive has finished', async () => {
    const target = await openTarget();
    await target.writeManifest(bytes('<theme />'));
    await target.commit();

    expect(await target.writeAsset(assetPath('bg1.png'), bytes('late'))).toMatchObject({
      ok: false,
    });
    expect(await target.commit()).toMatchObject({ ok: false });
  });

  it('does not delete the archive it published when discard is called afterwards', async () => {
    const target = await openTarget();
    await target.writeManifest(bytes('<theme />'));
    await target.commit();

    await target.discard();

    expect(zipEntryNames(await readArchive())).toEqual(['theme.xml']);
  });

  it('never names the machine in what it reports', async () => {
    const failure = await failureOpening(join(workspace, 'missing', 'MyTheme.zip'));

    expect(failure.message).not.toContain(workspace);
    expect(failure.message).not.toContain(tmpdir());
  });
});
