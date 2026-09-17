import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ThemeExportFailure,
  ThemeExportTarget,
} from '@/application/ports/theme-export-target';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { openFolderExportTarget } from '@/infrastructure/export/folder-export-target';
import { assetPath } from '../support/theme-fixtures';

/** Creating a symbolic link needs a privilege Windows does not grant by default. */
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

/**
 * Whether a folder the user cannot write to actually refuses a write. It does not when the
 * tests run as root, and Windows does not apply the permission bits at all.
 */
const permissionsEnforced = ((): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'vitatheme-permission-probe-'));
  try {
    chmodSync(probe, 0o500);
    writeFileSync(join(probe, 'denied'), 'probe');
    return false;
  } catch {
    return true;
  } finally {
    chmodSync(probe, 0o700);
    rmSync(probe, { recursive: true, force: true });
  }
})();

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

let workspace: string;
let destination: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-export-'));
  destination = join(workspace, 'MyTheme');
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const openTarget = async (path = destination, overwrite = false): Promise<ThemeExportTarget> => {
  const opened = await openFolderExportTarget(path, { overwrite });
  if (!opened.ok) {
    throw new Error(`Expected the target to open, but it failed: ${opened.error.message}`);
  }
  return opened.value;
};

const failureOpening = async (path: string, overwrite = false): Promise<ThemeExportFailure> => {
  const opened = await openFolderExportTarget(path, { overwrite });
  if (opened.ok) {
    await opened.value.discard();
    throw new Error('Expected opening the target to fail, but it succeeded');
  }
  return opened.error;
};

const expectWritten = async (written: Promise<{ ok: boolean }>, what: string): Promise<void> => {
  expect(await written, what).toMatchObject({ ok: true });
};

const writeCompleteTheme = async (target: ThemeExportTarget): Promise<void> => {
  await expectWritten(target.writeManifest(bytes('<theme />')), 'the manifest');
  await expectWritten(target.writeAsset(assetPath('bg1.png'), bytes('background')), 'a background');
  await expectWritten(
    target.writeAsset(assetPath('icons/music.png'), bytes('icon')),
    'an icon in a subfolder',
  );
};

describe('openFolderExportTarget', () => {
  it('writes the manifest and the assets under the names the theme uses', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);

    expect(await target.commit()).toMatchObject({ ok: true });
    expect(await readFile(join(destination, 'theme.xml'), 'utf-8')).toBe('<theme />');
    expect(await readFile(join(destination, 'bg1.png'), 'utf-8')).toBe('background');
    expect(await readFile(join(destination, 'icons', 'music.png'), 'utf-8')).toBe('icon');
  });

  it('puts nothing at the destination until the export is committed', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);

    expect(await readdir(workspace)).not.toContain('MyTheme');

    await target.commit();
    expect(await readdir(workspace)).toContain('MyTheme');
  });

  it('leaves nothing behind when the export is discarded', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);

    await target.discard();

    expect(await readdir(workspace)).toEqual([]);
  });

  it('leaves no working files beside the theme once it is committed', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);
    await target.commit();

    expect(await readdir(workspace)).toEqual(['MyTheme']);
  });

  it('refuses a destination that is already taken', async () => {
    await mkdir(destination);

    expect(await failureOpening(destination)).toMatchObject({ code: 'destination-exists' });
  });

  it('replaces an existing theme only when asked to', async () => {
    await mkdir(destination);
    await writeFile(join(destination, 'left-over.png'), 'from the previous export');

    const target = await openTarget(destination, true);
    await writeCompleteTheme(target);
    expect(await target.commit()).toMatchObject({ ok: true });

    expect(await readdir(destination)).toEqual(
      expect.arrayContaining(['theme.xml', 'bg1.png', 'icons']),
    );
    expect(await readdir(destination)).not.toContain('left-over.png');
    expect(await readdir(workspace)).toEqual(['MyTheme']);
  });

  it('keeps the previous theme untouched while the new one is being written', async () => {
    await mkdir(destination);
    await writeFile(join(destination, 'theme.xml'), 'the previous theme');

    const target = await openTarget(destination, true);
    await target.writeManifest(bytes('the new theme'));

    expect(await readFile(join(destination, 'theme.xml'), 'utf-8')).toBe('the previous theme');
  });

  it('refuses a destination whose parent folder does not exist', async () => {
    const failure = await failureOpening(join(workspace, 'missing', 'MyTheme'));

    expect(failure.code).toBe('destination-invalid');
  });

  it('refuses to replace something that is not a folder', async () => {
    await writeFile(destination, 'a file, not a theme folder');

    expect(await failureOpening(destination, true)).toMatchObject({
      code: 'destination-invalid',
    });
  });

  it('refuses to write the same file twice, which would hide one of them', async () => {
    const target = await openTarget();
    await target.writeAsset(assetPath('bg1.png'), bytes('first'));

    const second = await target.writeAsset(assetPath('bg1.png'), bytes('second'));

    expect(second).toMatchObject({ ok: false, error: { code: 'duplicate-file' } });
  });

  it('confines a path even if an unvalidated one reaches the target', async () => {
    const target = await openTarget();
    // The type system stops this at the boundary; the target must not depend on that alone.
    const escaping = '../escaped.png' as ThemeAssetPath;

    const written = await target.writeAsset(escaping, bytes('payload'));

    expect(written).toMatchObject({ ok: false, error: { code: 'unsafe-asset-path' } });
    await target.discard();
    expect(await readdir(workspace)).toEqual([]);
  });

  it('refuses to write anything once the export has finished', async () => {
    const target = await openTarget();
    await target.writeManifest(bytes('<theme />'));
    await target.commit();

    expect(await target.writeAsset(assetPath('bg1.png'), bytes('late'))).toMatchObject({
      ok: false,
    });
    expect(await target.commit()).toMatchObject({ ok: false });
  });

  it('does not delete the theme it published when discard is called afterwards', async () => {
    const target = await openTarget();
    await target.writeManifest(bytes('<theme />'));
    await target.commit();

    await target.discard();

    expect(await readdir(destination)).toEqual(['theme.xml']);
  });

  it('refuses to publish over something that appeared while the theme was being written', async () => {
    const target = await openTarget();
    await writeCompleteTheme(target);

    // Somebody else took the destination between the check and the commit.
    await mkdir(destination);
    await writeFile(join(destination, 'somebody-elses.txt'), 'not ours to replace');

    expect(await target.commit()).toMatchObject({
      ok: false,
      error: { code: 'destination-exists' },
    });
    expect(await readdir(destination)).toEqual(['somebody-elses.txt']);
    expect(await readdir(workspace)).toEqual(['MyTheme']);
  });

  it.skipIf(!permissionsEnforced)('reports a folder it is not allowed to write to', async () => {
    const readOnly = join(workspace, 'read-only');
    await mkdir(readOnly);
    await chmod(readOnly, 0o500);

    try {
      expect(await failureOpening(join(readOnly, 'MyTheme'))).toMatchObject({
        code: 'destination-unwritable',
      });
    } finally {
      await chmod(readOnly, 0o700);
    }
  });

  it('never names the machine in what it reports', async () => {
    const failure = await failureOpening(join(workspace, 'missing', 'MyTheme'));

    expect(failure.message).not.toContain(workspace);
    expect(failure.message).not.toContain(tmpdir());
  });

  describe.skipIf(!symbolicLinksAvailable)('symbolic links', () => {
    it('refuses to replace a link standing where the theme folder should be', async () => {
      const elsewhere = join(workspace, 'elsewhere');
      await mkdir(elsewhere);
      await symlink(elsewhere, destination);

      expect(await failureOpening(destination, true)).toMatchObject({
        code: 'destination-invalid',
      });
      expect(await readdir(elsewhere)).toEqual([]);
    });

    it('does not write through a link that was planted inside the export', async () => {
      const outside = join(workspace, 'outside');
      await mkdir(outside);

      const target = await openTarget();
      // Reach into the staging folder the way a hostile theme folder would have to.
      const [staging] = (await readdir(workspace)).filter((entry) => entry !== 'outside');
      await symlink(outside, join(workspace, staging ?? '', 'icons'));

      const written = await target.writeAsset(assetPath('icons/music.png'), bytes('icon'));

      expect(written).toMatchObject({ ok: false, error: { code: 'unsafe-asset-path' } });
      expect(await readdir(outside)).toEqual([]);
    });
  });
});
