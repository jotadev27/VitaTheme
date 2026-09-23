import { describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot, ThemeSnapshot } from '@/ipc';

vi.mock('electron', () => ({
  app: { getName: () => 'VitaTheme' },
  Menu: { buildFromTemplate: (items: unknown) => ({ items }) },
  shell: { openExternal: vi.fn() },
}));

import { buildApplicationMenu } from '@/main/menu';

interface Item {
  readonly label?: string;
  readonly enabled?: boolean;
  readonly submenu?: readonly Item[];
  readonly click?: () => void;
}

const menu = (snapshot: SessionSnapshot, send = vi.fn()) => ({
  items: (
    buildApplicationMenu(() => ({ webContents: { send } }) as never, snapshot) as unknown as {
      items: Item[];
    }
  ).items,
  send,
});

const find = (items: readonly Item[], label: string): Item => {
  const item = items.find((candidate) => candidate.label === label);
  if (item === undefined) throw new Error(`Missing menu item: ${label}`);
  return item;
};

const empty: SessionSnapshot = {
  theme: null,
  lastExport: null,
  recovery: null,
  recentProjects: [],
};
const active: SessionSnapshot = {
  ...empty,
  theme: { canUndo: true, canRedo: true } as ThemeSnapshot,
};

describe('application menu wiring', () => {
  it('groups project operations in File and disables commands with no open theme', () => {
    const { items } = menu(empty);
    const file = find(items, 'File').submenu!;
    expect(find(file, 'New…').enabled).toBe(true);
    expect(find(file, 'Open Project…').enabled).toBe(true);
    expect(find(file, 'Open Theme Folder…').enabled).toBe(true);
    expect(find(file, 'Save').enabled).toBe(false);
    expect(find(file, 'Close Theme').enabled).toBe(false);
    expect(find(find(file, 'Export Theme').submenu!, 'Export ZIP…').enabled).toBe(false);
  });

  it('sends every working command through the application bridge', () => {
    const { items, send } = menu(active);
    const file = find(items, 'File').submenu!;
    for (const [label, command] of [
      ['New…', 'new-theme'],
      ['Open Project…', 'open-project'],
      ['Open Theme Folder…', 'open-theme'],
      ['Save', 'save-project'],
      ['Save As…', 'save-project-as'],
      ['Close Theme', 'close-theme'],
    ] as const) {
      find(file, label).click?.();
      expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', command);
    }
    const exports = find(file, 'Export Theme').submenu!;
    find(exports, 'Export Folder…').click?.();
    expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', 'export-folder');
    find(exports, 'Export ZIP…').click?.();
    expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', 'export-archive');
    find(find(items, 'Edit').submenu!, 'Undo').click?.();
    expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', 'undo');
    find(find(items, 'Edit').submenu!, 'Redo').click?.();
    expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', 'redo');
    find(find(items, 'View').submenu!, 'Edit Workspace').click?.();
    expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', 'show-edit');
    find(find(items, 'View').submenu!, 'Preview Theme').click?.();
    expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', 'show-preview');
    find(find(items, 'Theme').submenu!, 'Check Again').click?.();
    expect(send).toHaveBeenLastCalledWith('vitatheme:app:command', 'refresh-theme');
  });
});
