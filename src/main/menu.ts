import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC_CHANNELS, type AppCommand } from '../ipc/contract';

/**
 * The application menu.
 *
 * Menu items do not act on the session themselves: they send the same command the toolbar
 * sends, and the window asks for it back through the bridge. One path means a menu item and
 * a button cannot come to mean different things, and the window stays the only place that
 * knows whether an action makes sense right now.
 *
 * "Theme" holds both halves of the work deliberately: a project is what somebody is editing,
 * and the exported theme is what they are editing it into. Opening the project is the plain
 * Open, because it is the one people will reach for every day.
 */

const PROJECT_URL = 'https://github.com/jotadev27/VitaTheme';

const isMac = process.platform === 'darwin';

const send = (window: BrowserWindow | null, command: AppCommand): void => {
  window?.webContents.send(IPC_CHANNELS.appCommand, command);
};

const commandItem = (
  label: string,
  command: AppCommand,
  accelerator: string | undefined,
  windowOf: () => BrowserWindow | null,
): MenuItemConstructorOptions => ({
  label,
  ...(accelerator === undefined ? {} : { accelerator }),
  click: () => {
    send(windowOf(), command);
  },
});

export const buildApplicationMenu = (windowOf: () => BrowserWindow | null): Menu => {
  const item = (
    label: string,
    command: AppCommand,
    accelerator?: string,
  ): MenuItemConstructorOptions => commandItem(label, command, accelerator, windowOf);

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.getName(),
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : [];

  const themeMenu: MenuItemConstructorOptions = {
    label: 'Theme',
    submenu: [
      item('New Theme…', 'new-theme', 'CmdOrCtrl+N'),
      item('Open Project…', 'open-project', 'CmdOrCtrl+O'),
      item('Open Theme Folder…', 'open-theme', 'CmdOrCtrl+Shift+O'),
      item('Reopen Last Project', 'reopen-last-project', 'CmdOrCtrl+Shift+T'),
      { type: 'separator' },
      item('Save', 'save-project', 'CmdOrCtrl+S'),
      item('Save As…', 'save-project-as', 'CmdOrCtrl+Shift+S'),
      { type: 'separator' },
      item('Check Again', 'refresh-theme', 'CmdOrCtrl+R'),
      { type: 'separator' },
      item('Export as Folder…', 'export-folder', 'CmdOrCtrl+E'),
      item('Export as ZIP Archive…', 'export-archive', 'CmdOrCtrl+Shift+E'),
      item('Show Last Export', 'reveal-export'),
      { type: 'separator' },
      item('Close Theme', 'close-theme', 'CmdOrCtrl+W'),
      ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      // The theme's own history, not the focused field's: this is a document editor, and
      // Cmd+Z is expected to take back the change that was made to the theme. Text fields
      // commit what was typed when they are left, so a change is a whole field at a time.
      item('Undo', 'undo', 'CmdOrCtrl+Z'),
      item('Redo', 'redo', isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'),
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      item('Preview Theme', 'toggle-preview', 'CmdOrCtrl+P'),
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      // Kept for diagnosing the interface itself; it grants the window nothing it did not
      // already have, since everything it can reach goes through the bridge.
      { role: 'toggleDevTools' },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    submenu: isMac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'close' }],
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      {
        label: 'PS Vita Theme Format',
        click: () => {
          void shell.openExternal(`${PROJECT_URL}/blob/main/docs/ps-vita-theme-format.md`);
        },
      },
      {
        label: 'Report an Issue',
        click: () => {
          void shell.openExternal(`${PROJECT_URL}/issues`);
        },
      },
    ],
  };

  return Menu.buildFromTemplate([...appMenu, themeMenu, editMenu, viewMenu, windowMenu, helpMenu]);
};
