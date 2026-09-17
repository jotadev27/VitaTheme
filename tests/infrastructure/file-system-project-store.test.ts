import { chmod, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectAssets, ProjectStore } from '@/application/ports/project-store';
import type { ThemeAssetPath } from '@/domain/model/theme-asset-path';
import { failure, success } from '@/domain/shared/result';
import { fileSystemProjectStore } from '@/infrastructure/project/file-system-project-store';
import { assetPath } from '../support/theme-fixtures';

/**
 * Projects on a real filesystem.
 *
 * Saving is where somebody's work can be lost, so most of this is about what survives a
 * failure: a project that was already there, a folder of artwork that was already beside it,
 * and the work still held in memory. The rest is about reading a project that came from
 * somewhere else, which is untrusted input like any other file.
 */

let workspace: string;
let store: ProjectStore;
let projectPath: string;
let assetsPath: string;

const PROJECT_TEXT = '{"format":"vitatheme","version":1}';

const assetsOf = (files: Record<string, string>): ProjectAssets => ({
  paths: Object.keys(files) as ThemeAssetPath[],
  open: (path) => {
    const contents = files[path];
    return Promise.resolve(
      contents === undefined
        ? failure({ code: 'missing' as const, message: `"${path}" is not there.` })
        : success(new TextEncoder().encode(contents)),
    );
  },
});

const read = async (path: string): Promise<string> => (await readFile(path)).toString('utf-8');

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-projects-'));
  projectPath = join(workspace, 'My Theme.vitatheme');
  assetsPath = join(workspace, 'My Theme.assets');
  store = fileSystemProjectStore({
    untitledRecoveryPath: join(workspace, 'recovery', 'untitled.vitatheme.autosave'),
  });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('saving a project', () => {
  it('writes the document and the files it refers to, beside each other', async () => {
    const written = await store.write(
      projectPath,
      PROJECT_TEXT,
      assetsOf({ 'background-1.png': 'first', 'icon-browser.png': 'second' }),
    );

    expect(written.ok).toBe(true);
    expect(await read(projectPath)).toBe(PROJECT_TEXT);
    expect((await readdir(assetsPath)).sort()).toEqual(['background-1.png', 'icon-browser.png']);
    expect(await read(join(assetsPath, 'background-1.png'))).toBe('first');
  });

  it('keeps a file the theme holds inside a folder of its own', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'art/lock.png': 'artwork' }));

    expect(await read(join(assetsPath, 'art', 'lock.png'))).toBe('artwork');
  });

  it('replaces the whole folder, so a file the theme no longer refers to does not linger', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'old.png': 'gone tomorrow' }));
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'new.png': 'here today' }));

    expect(await readdir(assetsPath)).toEqual(['new.png']);
  });

  it('leaves the files alone when the caller says they are already the right ones', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'background-1.png': 'first' }));

    const written = await store.write(
      projectPath,
      '{"format":"vitatheme","version":1,"x":1}',
      null,
    );

    expect(written.ok).toBe(true);
    expect(await read(projectPath)).toContain('"x":1');
    expect(await read(join(assetsPath, 'background-1.png'))).toBe('first');
  });

  it('writes no document when one of the files cannot be read', async () => {
    const written = await store.write(projectPath, PROJECT_TEXT, {
      paths: [assetPath('background-1.png')],
      open: () =>
        Promise.resolve(failure({ code: 'missing' as const, message: 'That file is gone.' })),
    });

    expect(written.ok).toBe(false);
    expect(written.ok || written.error.code).toBe('asset-unreadable');
    await expect(readdir(workspace)).resolves.toEqual([]);
  });

  it('leaves the previous project exactly as it was when a save fails part-way', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'background-1.png': 'first' }));

    const failed = await store.write(projectPath, '{"format":"vitatheme","version":1,"x":2}', {
      paths: [assetPath('background-1.png'), assetPath('music.at9')],
      open: (path) =>
        Promise.resolve(
          path === 'music.at9'
            ? failure({ code: 'unreadable' as const, message: 'The disc went away.' })
            : success(new TextEncoder().encode('replacement')),
        ),
    });

    expect(failed.ok).toBe(false);
    // Both halves are untouched: the document still describes files that are still there.
    expect(await read(projectPath)).toBe(PROJECT_TEXT);
    expect(await read(join(assetsPath, 'background-1.png'))).toBe('first');
    expect(await readdir(assetsPath)).toEqual(['background-1.png']);
  });

  it('leaves nothing behind when a save fails', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'background-1.png': 'first' }));

    await store.write(projectPath, PROJECT_TEXT, {
      paths: [assetPath('background-1.png')],
      open: () => Promise.resolve(failure({ code: 'missing' as const, message: 'Gone.' })),
    });

    // No staging folder, no half-written project: only what was there before.
    expect((await readdir(workspace)).sort()).toEqual(['My Theme.assets', 'My Theme.vitatheme']);
  });

  it('refuses a destination that is a folder rather than a project', async () => {
    await mkdir(projectPath);

    const written = await store.write(projectPath, PROJECT_TEXT, null);

    expect(written.ok).toBe(false);
    expect(written.ok || written.error.code).toBe('destination-invalid');
  });

  it('refuses a folder that is not there, and says so as a project rather than an export', async () => {
    const written = await store.write(
      join(workspace, 'no-such-folder', 'Theme.vitatheme'),
      PROJECT_TEXT,
      null,
    );

    expect(written.ok).toBe(false);
    expect(written.ok || written.error.message).toContain('project');
    expect(written.ok || written.error.message).not.toContain('export');
  });

  it('says where it could not write without saying where anything is', async () => {
    const readOnly = join(workspace, 'locked');
    await mkdir(readOnly);
    await chmod(readOnly, 0o500);

    const written = await store.write(join(readOnly, 'Theme.vitatheme'), PROJECT_TEXT, null);
    await chmod(readOnly, 0o700);

    expect(written.ok).toBe(false);
    expect(written.ok || written.error.message).not.toContain(workspace);
  });
});

describe('opening a project', () => {
  it('reads the document back and opens the files beside it', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'background-1.png': 'first' }));

    const opened = await store.read(projectPath);

    expect(opened.ok && opened.value.document).toBe(PROJECT_TEXT);
    const asset = opened.ok
      ? await opened.value.assets.openAsset(assetPath('background-1.png'))
      : null;
    expect(asset?.ok === true && new TextDecoder().decode(asset.value)).toBe('first');
  });

  it('opens a project whose files are missing, and reports them missing', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'background-1.png': 'first' }));
    await rm(assetsPath, { recursive: true });

    const opened = await store.read(projectPath);

    expect(opened.ok).toBe(true);
    const lookup = opened.ok
      ? await opened.value.assets.inspectAsset(assetPath('background-1.png'))
      : null;
    expect(lookup?.status).toBe('missing');
  });

  it('refuses a project that is not there', async () => {
    const opened = await store.read(join(workspace, 'Nothing.vitatheme'));

    expect(opened.ok || opened.error.code).toBe('not-found');
  });

  it('refuses a folder where a project should be', async () => {
    await mkdir(projectPath);

    expect((await store.read(projectPath)).ok).toBe(false);
  });

  it('refuses a file far larger than a project', async () => {
    await writeFile(projectPath, 'x'.repeat(5 * 1024 * 1024));

    const opened = await store.read(projectPath);

    expect(opened.ok || opened.error.code).toBe('too-large');
  });

  it('says nothing about where the project is when it cannot be read', async () => {
    const opened = await store.read(join(workspace, 'Nothing.vitatheme'));

    expect(opened.ok || opened.error.message).not.toContain(workspace);
    expect(opened.ok || opened.error.message).not.toContain(tmpdir());
  });
});

describe('a project that came from somewhere else', () => {
  it('refuses to read through an asset folder that is a link to elsewhere', async () => {
    const elsewhere = join(workspace, 'somewhere-private');
    await mkdir(elsewhere);
    await writeFile(join(elsewhere, 'background-1.png'), 'not the project’s to read');
    await writeFile(projectPath, PROJECT_TEXT);
    await symlink(elsewhere, assetsPath);

    const opened = await store.read(projectPath);

    // The project opens; it simply has no files of its own, which is what it really has.
    expect(opened.ok).toBe(true);
    const lookup = opened.ok
      ? await opened.value.assets.inspectAsset(assetPath('background-1.png'))
      : null;
    expect(lookup?.status).toBe('missing');
  });

  it('refuses to read a file inside the folder that leads out of it', async () => {
    const secret = join(workspace, 'secret.png');
    await writeFile(secret, 'not the project’s to read');
    await writeFile(projectPath, PROJECT_TEXT);
    await mkdir(assetsPath);
    await symlink(secret, join(assetsPath, 'background-1.png'));

    const opened = await store.read(projectPath);
    const asset = opened.ok
      ? await opened.value.assets.openAsset(assetPath('background-1.png'))
      : null;

    expect(asset?.ok).toBe(false);
    expect(asset?.ok === false && asset.error.code).toBe('escapes-theme');
  });
});

describe('work in progress', () => {
  it('is kept beside the project without touching it', async () => {
    await store.write(projectPath, PROJECT_TEXT, null);

    const kept = await store.writeRecovery(
      { kind: 'project', path: projectPath },
      '{"format":"vitatheme","version":1,"edited":true}',
    );

    expect(kept.ok).toBe(true);
    expect(await read(projectPath)).toBe(PROJECT_TEXT);
    expect(await read(`${projectPath}.autosave`)).toContain('"edited":true');
  });

  it('is read back with the files of the project it belongs to', async () => {
    await store.write(projectPath, PROJECT_TEXT, assetsOf({ 'background-1.png': 'first' }));
    await store.writeRecovery({ kind: 'project', path: projectPath }, '{"edited":true}');

    const recovered = await store.readRecovery({ kind: 'project', path: projectPath });

    expect(recovered.ok && recovered.value.document).toBe('{"edited":true}');
    const asset = recovered.ok
      ? await recovered.value.assets.openAsset(assetPath('background-1.png'))
      : null;
    expect(asset?.ok === true && new TextDecoder().decode(asset.value)).toBe('first');
  });

  it('is kept for a theme that has never been saved anywhere', async () => {
    expect(await store.hasRecovery({ kind: 'untitled' })).toBe(false);

    await store.writeRecovery({ kind: 'untitled' }, '{"unsaved":true}');

    expect(await store.hasRecovery({ kind: 'untitled' })).toBe(true);
    expect((await store.readRecovery({ kind: 'untitled' })).ok).toBe(true);
  });

  it('is removed without removing the project', async () => {
    await store.write(projectPath, PROJECT_TEXT, null);
    await store.writeRecovery({ kind: 'project', path: projectPath }, '{"edited":true}');

    await store.removeRecovery({ kind: 'project', path: projectPath });

    expect(await store.hasRecovery({ kind: 'project', path: projectPath })).toBe(false);
    expect(await read(projectPath)).toBe(PROJECT_TEXT);
  });

  it('can be removed when there is none, without complaining', async () => {
    await expect(store.removeRecovery({ kind: 'untitled' })).resolves.toBeUndefined();
  });

  it('is read back as it was written, damage and all, for the caller to refuse', async () => {
    await store.writeRecovery({ kind: 'untitled' }, 'not a document at all');

    const recovered = await store.readRecovery({ kind: 'untitled' });

    // The store's job is the file; deciding whether it is a project is the codec's.
    expect(recovered.ok && recovered.value.document).toBe('not a document at all');
  });
});
