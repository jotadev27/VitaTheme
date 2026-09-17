import { describe, expect, it } from 'vitest';
import type { RecentProject } from '@/application/ports/recent-projects-store';
import {
  forgetRecentProject,
  lastRecentProject,
  MAX_RECENT_PROJECTS,
  orderRecentProjects,
  rememberRecentProject,
} from '@/application/session/recent-projects';

/**
 * Which projects are offered next time, and in what order.
 *
 * All of it is list arithmetic, so all of it is tested without a disk: what a list becomes
 * when a project is opened, saved again, or taken off it.
 */

const entry = (overrides: Partial<RecentProject> = {}): RecentProject => ({
  id: 'aaaa1111',
  name: 'My Theme',
  path: '/projects/My Theme.vitatheme',
  openedAt: 1_000,
  ...overrides,
});

let nextId = 0;
const newId = (): string => `id${String((nextId += 1)).padStart(6, '0')}`;

describe('remembering a project', () => {
  it('puts a project nobody has opened before at the top', () => {
    const list = rememberRecentProject([], { path: '/a/One.vitatheme', name: 'One' }, 5, newId);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'One', path: '/a/One.vitatheme', openedAt: 5 });
  });

  it('moves a project that is already known to the top, without repeating it', () => {
    const before = [
      entry({ id: 'aaaa1111', path: '/a/One.vitatheme', name: 'One', openedAt: 1 }),
      entry({ id: 'bbbb2222', path: '/b/Two.vitatheme', name: 'Two', openedAt: 2 }),
    ];

    const after = rememberRecentProject(
      before,
      { path: '/a/One.vitatheme', name: 'One' },
      9,
      newId,
    );

    expect(after.map((project) => project.path)).toEqual(['/a/One.vitatheme', '/b/Two.vitatheme']);
    expect(after[0]?.openedAt).toBe(9);
  });

  it('keeps the identity the window was already given', () => {
    const before = [entry({ id: 'aaaa1111', path: '/a/One.vitatheme' })];

    const after = rememberRecentProject(
      before,
      { path: '/a/One.vitatheme', name: 'One' },
      9,
      newId,
    );

    expect(after[0]?.id).toBe('aaaa1111');
  });

  it('takes the new name when a project is saved under a different one', () => {
    const before = [entry({ path: '/a/One.vitatheme', name: 'Old name' })];

    const after = rememberRecentProject(
      before,
      { path: '/a/One.vitatheme', name: 'New name' },
      9,
      newId,
    );

    expect(after[0]?.name).toBe('New name');
  });

  it('treats a project saved somewhere else as another project', () => {
    const before = [entry({ path: '/a/One.vitatheme', name: 'One' })];

    const after = rememberRecentProject(
      before,
      { path: '/b/One.vitatheme', name: 'One' },
      9,
      newId,
    );

    expect(after).toHaveLength(2);
  });

  it('remembers only as many projects as the list holds, dropping the oldest', () => {
    let list: readonly RecentProject[] = [];
    for (let index = 0; index < MAX_RECENT_PROJECTS + 5; index += 1) {
      list = rememberRecentProject(
        list,
        { path: `/a/Project ${String(index)}.vitatheme`, name: `Project ${String(index)}` },
        index,
        newId,
      );
    }

    expect(list).toHaveLength(MAX_RECENT_PROJECTS);
    expect(list[0]?.name).toBe(`Project ${String(MAX_RECENT_PROJECTS + 4)}`);
    expect(list.map((project) => project.name)).not.toContain('Project 0');
  });

  it('bounds a name long enough to be a problem', () => {
    const list = rememberRecentProject(
      [],
      { path: '/a/One.vitatheme', name: 'x'.repeat(5000) },
      1,
      newId,
    );

    expect(list[0]?.name.length).toBeLessThanOrEqual(200);
  });
});

describe('taking a project off the list', () => {
  it('removes the entry that was named', () => {
    const before = [entry({ id: 'aaaa1111' }), entry({ id: 'bbbb2222', path: '/b/Two.vitatheme' })];

    expect(forgetRecentProject(before, 'aaaa1111').map((project) => project.id)).toEqual([
      'bbbb2222',
    ]);
  });

  it('changes nothing when the entry is not on the list', () => {
    const before = [entry()];

    expect(forgetRecentProject(before, 'not-an-entry')).toEqual(before);
  });
});

describe('the order they are offered in', () => {
  it('is most recently worked on first, whatever order they were stored in', () => {
    const stored = [
      entry({ id: 'aaaa1111', name: 'Old', openedAt: 1 }),
      entry({ id: 'bbbb2222', name: 'Newest', path: '/b/Two.vitatheme', openedAt: 30 }),
      entry({ id: 'cccc3333', name: 'Middle', path: '/c/Three.vitatheme', openedAt: 20 }),
    ];

    expect(orderRecentProjects(stored).map((project) => project.name)).toEqual([
      'Newest',
      'Middle',
      'Old',
    ]);
  });

  it('never offers more than the list holds, however many were stored', () => {
    const stored = Array.from({ length: 50 }, (_unused, index) =>
      entry({ id: `id${String(index)}`, path: `/a/${String(index)}.vitatheme`, openedAt: index }),
    );

    expect(orderRecentProjects(stored)).toHaveLength(MAX_RECENT_PROJECTS);
  });

  it('names the project to reopen, and nothing when there is none', () => {
    expect(lastRecentProject([])).toBeNull();
    expect(
      lastRecentProject([
        entry({ name: 'Older', openedAt: 1 }),
        entry({ name: 'Newer', openedAt: 2 }),
      ])?.name,
    ).toBe('Newer');
  });
});
