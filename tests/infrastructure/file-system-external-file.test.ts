import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_THEME_ASSET_BYTES } from '@/application/ports/theme-assets';
import type { ExternalFile, ExternalFileStore } from '@/application/ports/external-file';
import { fileSystemExternalFiles } from '@/infrastructure/filesystem/file-system-external-file';
import { pngHeaderBytes, riffWaveBytes } from '../support/binary-fixtures';

/**
 * Files chosen from outside a theme.
 *
 * There is no root to keep these inside, so what is checked here is everything else: that a
 * link is resolved rather than followed later, that only a regular file is read, that a
 * ceiling applies, and that what a file *is* comes from its bytes rather than its name.
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

let workspace: string;
let files: ExternalFileStore;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-external-'));
  files = fileSystemExternalFiles();
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const at = (name: string): string => join(workspace, name);

const inspected = async (path: string): Promise<ExternalFile> => {
  const result = await files.inspect(path);
  if (!result.ok) {
    throw new Error(`Expected the file to be accepted: ${result.error.message}`);
  }
  return result.value;
};

describe('examining a file', () => {
  it('identifies an image from its header', async () => {
    await writeFile(at('artwork.png'), pngHeaderBytes({ width: 960, height: 512 }));

    const file = await inspected(at('artwork.png'));

    expect(file.inspected.media).toMatchObject({
      kind: 'image',
      format: 'png',
      width: 960,
      height: 512,
    });
    expect(file.displayName).toBe('artwork.png');
  });

  it('identifies music from its container', async () => {
    await writeFile(at('music.at9'), riffWaveBytes({ atrac9: true }));

    expect((await inspected(at('music.at9'))).inspected.media).toMatchObject({
      kind: 'audio',
      format: 'at9',
    });
  });

  it('believes the bytes rather than the name', async () => {
    // A PNG called .at9 is a PNG, and a theme that claims otherwise is what the validator
    // is for. Nothing here takes the extension as an answer.
    await writeFile(at('music.at9'), pngHeaderBytes({ width: 8, height: 8 }));

    expect((await inspected(at('music.at9'))).inspected.media).toMatchObject({ kind: 'image' });
  });

  it('says so when a file is nothing it recognises', async () => {
    await writeFile(at('notes.txt'), 'just some text');

    expect((await inspected(at('notes.txt'))).inspected.media).toEqual({ kind: 'unrecognized' });
  });

  it('reports the size on disk', async () => {
    const bytes = new Uint8Array(4096);
    bytes.set(pngHeaderBytes({ width: 22, height: 22 }));
    await writeFile(at('padded.png'), bytes);

    expect((await inspected(at('padded.png'))).inspected.byteSize).toBe(4096);
  });

  it('reports a file that is not there', async () => {
    const result = await files.inspect(at('nothing.png'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('missing');
  });

  it('refuses a folder', async () => {
    await mkdir(at('folder'));

    const result = await files.inspect(at('folder'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not-a-file');
  });

  it('refuses a file larger than any theme asset, without reading it', async () => {
    const handle = await open(at('huge.png'), 'w');
    await handle.truncate(MAX_THEME_ASSET_BYTES + 1);
    await handle.close();

    const result = await files.inspect(at('huge.png'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('too-large');
  });

  it('never says where the file was in what it reports', async () => {
    const result = await files.inspect(at('nothing.png'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).not.toContain(workspace);
    expect(result.error.message).not.toContain(tmpdir());
  });
});

describe('reading a file that was examined earlier', () => {
  it('reads exactly what is on disk', async () => {
    const contents = pngHeaderBytes({ width: 128, height: 128 });
    await writeFile(at('icon.png'), contents);
    const file = await inspected(at('icon.png'));

    const read = await files.read(file.reference);

    expect(read.ok && read.value).toEqual(contents);
  });

  it('reads a file larger than the window it identifies headers through', async () => {
    const bytes = new Uint8Array(200_000).fill(0x5a);
    bytes.set(pngHeaderBytes({ width: 960, height: 512 }));
    await writeFile(at('big.png'), bytes);
    const file = await inspected(at('big.png'));

    const read = await files.read(file.reference);

    expect(read.ok && read.value.byteLength).toBe(bytes.byteLength);
  });

  it('reports a file that has gone since it was chosen', async () => {
    await writeFile(at('icon.png'), pngHeaderBytes({ width: 128, height: 128 }));
    const file = await inspected(at('icon.png'));
    await rm(at('icon.png'));

    const read = await files.read(file.reference);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('missing');
  });

  it('checks the size again, because a file can grow after it was chosen', async () => {
    await writeFile(at('icon.png'), pngHeaderBytes({ width: 128, height: 128 }));
    const file = await inspected(at('icon.png'));

    const handle = await open(at('icon.png'), 'r+');
    await handle.truncate(MAX_THEME_ASSET_BYTES + 1);
    await handle.close();

    const read = await files.read(file.reference);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('too-large');
  });

  it('refuses to read something that is no longer a regular file', async () => {
    await writeFile(at('icon.png'), pngHeaderBytes({ width: 128, height: 128 }));
    const file = await inspected(at('icon.png'));
    await rm(at('icon.png'));
    await mkdir(at('icon.png'));

    const read = await files.read(file.reference);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('not-a-file');
  });

  it.skipIf(process.platform === 'win32')('reports one it is not allowed to read', async () => {
    await writeFile(at('icon.png'), pngHeaderBytes({ width: 128, height: 128 }));
    const file = await inspected(at('icon.png'));
    await chmod(at('icon.png'), 0o000);

    const read = await files.read(file.reference);

    await chmod(at('icon.png'), 0o600);
    // Running the tests as root would read it regardless; what matters is that a refusal is
    // reported rather than swallowed.
    expect(read.ok || read.error.code === 'unreadable').toBe(true);
  });
});

describe.skipIf(!symbolicLinksAvailable)('symbolic links', () => {
  it('resolves a link once, and holds what it pointed at', async () => {
    const real = at('real.png');
    await writeFile(real, pngHeaderBytes({ width: 22, height: 22 }));
    await symlink(real, at('link.png'));

    const file = await inspected(at('link.png'));

    // The reference is the file itself. Re-pointing the link afterwards changes nothing
    // about what this application will read.
    expect(file.reference).not.toContain('link.png');
    expect(file.inspected.media).toMatchObject({ width: 22, height: 22 });
  });

  it('cannot be made to read somewhere else by moving the link afterwards', async () => {
    const decoy = at('decoy.png');
    const secret = at('secret.png');
    await writeFile(decoy, pngHeaderBytes({ width: 22, height: 22 }));
    await writeFile(secret, pngHeaderBytes({ width: 960, height: 512 }));
    await symlink(decoy, at('link.png'));

    const file = await inspected(at('link.png'));
    await rm(at('link.png'));
    await symlink(secret, at('link.png'));

    const read = await files.read(file.reference);

    expect(read.ok && read.value).toEqual(await readContents(decoy));
  });

  it('refuses a link that points at nothing', async () => {
    await symlink(at('nothing.png'), at('broken.png'));

    const result = await files.inspect(at('broken.png'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('missing');
  });

  it('refuses a link to a folder', async () => {
    await mkdir(at('folder'));
    await symlink(at('folder'), at('link'));

    const result = await files.inspect(at('link'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not-a-file');
  });
});

const readContents = async (path: string): Promise<Uint8Array> => {
  const result = await files.inspect(path);
  if (!result.ok) {
    throw new Error('Expected the file to be readable');
  }
  const read = await files.read(result.value.reference);
  if (!read.ok) {
    throw new Error('Expected the file to be readable');
  }
  return read.value;
};
