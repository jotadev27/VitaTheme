import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecentProject, RecentProjectsStore } from '@/application/ports/recent-projects-store';
import { fileSystemRecentProjects } from '@/infrastructure/project/file-system-recent-projects';

/**
 * The list of recent projects, on a real filesystem.
 *
 * It is a file in a directory anybody can edit, holding paths this application would later
 * open — so most of this is about what happens when it says something it should not. Nothing
 * here is allowed to fail loudly: a damaged list of shortcuts costs two clicks, and is never
 * a reason to stop somebody working.
 */

let workspace: string;
let listPath: string;
let store: RecentProjectsStore;

const entry = (overrides: Partial<RecentProject> = {}): RecentProject => ({
  id: 'aaaa1111bbbb2222',
  name: 'My Theme',
  path: '/projects/My Theme.vitatheme',
  openedAt: 1_700_000_000_000,
  ...overrides,
});

const writeList = async (contents: unknown): Promise<void> => {
  await writeFile(listPath, typeof contents === 'string' ? contents : JSON.stringify(contents));
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vitatheme-recents-'));
  listPath = join(workspace, 'recent-projects.json');
  store = fileSystemRecentProjects({ path: listPath });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('keeping the list', () => {
  it('writes entries and reads them back', async () => {
    const entries = [entry(), entry({ id: 'cccc3333dddd4444', path: '/projects/Other.vitatheme' })];

    await store.write(entries);

    expect(await store.read()).toEqual(entries);
  });

  it('has nothing to offer before anything has been written', async () => {
    expect(await store.read()).toEqual([]);
  });

  it('creates the folder it is kept in', async () => {
    const nested = fileSystemRecentProjects({
      path: join(workspace, 'deeper', 'still', 'recent-projects.json'),
    });

    await nested.write([entry()]);

    expect(await nested.read()).toHaveLength(1);
  });

  it.skipIf(process.platform === 'win32')(
    'does not follow a pre-planted staging link',
    async () => {
      const unrelated = join(workspace, 'unrelated.txt');
      await writeFile(unrelated, 'keep this');
      await symlink(unrelated, `${listPath}.writing`);

      await store.write([entry()]);

      expect(await readFile(unrelated, 'utf-8')).toBe('keep this');
      expect(await store.read()).toEqual([entry()]);
    },
  );

  it('leaves the previous list in place when a write cannot happen', async () => {
    await store.write([entry({ name: 'Kept' })]);
    const blocked = fileSystemRecentProjects({ path: workspace });

    await expect(blocked.write([entry({ name: 'Never written' })])).resolves.toBeUndefined();
    expect((await store.read())[0]?.name).toBe('Kept');
  });

  it('survives the application being closed and started again', async () => {
    await store.write([entry({ name: 'Yesterday' })]);

    const afterRestart = fileSystemRecentProjects({ path: listPath });

    expect((await afterRestart.read())[0]?.name).toBe('Yesterday');
  });
});

describe('a list that says something it should not', () => {
  it('offers nothing when the file is not JSON', async () => {
    await writeList('this is not a list of anything');

    expect(await store.read()).toEqual([]);
  });

  it('offers nothing when the file is JSON but not a list', async () => {
    await writeList({ projects: 'all of them' });
    expect(await store.read()).toEqual([]);

    await writeList([entry()]);
    expect(await store.read()).toEqual([]);
  });

  it('drops an entry whose fields are the wrong types', async () => {
    await writeList({
      projects: [
        { id: 12, name: 'One', path: '/a/One.vitatheme', openedAt: 1 },
        { id: 'aaaa1111', name: 7, path: '/a/Two.vitatheme', openedAt: 1 },
        { id: 'aaaa1111', name: 'Three', path: 9, openedAt: 1 },
        { id: 'aaaa1111', name: 'Four', path: '/a/Four.vitatheme', openedAt: 'yesterday' },
        entry({ name: 'The only real one' }),
      ],
    });

    const read = await store.read();

    expect(read.map((project) => project.name)).toEqual(['The only real one']);
  });

  it('drops an entry naming something that is not a project', async () => {
    await writeList({
      projects: [
        entry({ id: 'aaaa1111', path: '/etc/passwd', name: 'Not a project' }),
        entry({ id: 'bbbb2222', path: '/a/theme.xml', name: 'A theme, not a project' }),
        entry({ id: 'cccc3333', path: '/a/Real.vitatheme', name: 'Real' }),
      ],
    });

    expect((await store.read()).map((project) => project.name)).toEqual(['Real']);
  });

  it('drops an entry whose path is relative, which nothing here would have written', async () => {
    await writeList({
      projects: [
        entry({ id: 'aaaa1111', path: '../../elsewhere/Sneaky.vitatheme', name: 'Traversal' }),
        entry({ id: 'bbbb2222', path: 'Relative.vitatheme', name: 'Relative' }),
        entry({ id: 'cccc3333', path: '/a/Real.vitatheme', name: 'Real' }),
      ],
    });

    expect((await store.read()).map((project) => project.name)).toEqual(['Real']);
  });

  it('drops an entry whose identifier is not one this application assigns', async () => {
    await writeList({
      projects: [
        entry({ id: '__proto__', name: 'Prototype' }),
        entry({ id: 'constructor', path: '/a/Two.vitatheme', name: 'Constructor' }),
        entry({ id: '../../escape', path: '/a/Three.vitatheme', name: 'Traversal' }),
        entry({ id: 'aaaa1111', path: '/a/Real.vitatheme', name: 'Real' }),
      ],
    });

    const read = await store.read();

    expect(read.map((project) => project.name)).toEqual(['Real']);
    expect(({} as Record<string, unknown>).Prototype).toBeUndefined();
  });

  it('does not let a list reach the prototype of anything', async () => {
    await writeList(
      '{"projects": [{"__proto__": {"polluted": true}, "id": "aaaa1111", "name": "One", "path": "/a/One.vitatheme", "openedAt": 1}]}',
    );

    await store.read();

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('keeps only the first mention of a project named twice', async () => {
    await writeList({
      projects: [
        entry({ id: 'aaaa1111', path: '/a/One.vitatheme', name: 'First' }),
        entry({ id: 'bbbb2222', path: '/a/One.vitatheme', name: 'Again' }),
      ],
    });

    expect((await store.read()).map((project) => project.name)).toEqual(['First']);
  });

  it('refuses a file far larger than a list of shortcuts', async () => {
    await writeFile(listPath, 'x'.repeat(300 * 1024));

    expect(await store.read()).toEqual([]);
  });

  it('reads no more entries than a list could sensibly hold', async () => {
    await writeList({
      projects: Array.from({ length: 500 }, (_unused, index) =>
        entry({
          id: `aaaa${String(index).padStart(4, '0')}`,
          path: `/a/Project ${String(index)}.vitatheme`,
        }),
      ),
    });

    expect((await store.read()).length).toBeLessThanOrEqual(100);
  });

  it('offers nothing when a folder is where the list should be', async () => {
    await rm(listPath, { force: true });
    await mkdir(listPath);

    expect(await store.read()).toEqual([]);
  });
});

describe('what the file holds', () => {
  it('says which version wrote it, and nothing about the machine beyond the paths', async () => {
    await store.write([entry()]);

    const written = await readFile(listPath, 'utf-8');
    const document = JSON.parse(written) as { version: number; projects: unknown[] };

    expect(document.version).toBe(1);
    expect(written).not.toContain('openedBy');
    expect(Object.keys(document.projects[0] as object).sort()).toEqual([
      'id',
      'name',
      'openedAt',
      'path',
    ]);
  });
});
