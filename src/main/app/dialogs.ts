import {
  dialog,
  type BrowserWindow,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
} from 'electron';

/**
 * Every path the application uses comes from here.
 *
 * Choosing a location is the one thing that must involve the person at the keyboard, so the
 * only way into the filesystem is a dialog they opened and confirmed. Nothing else in this
 * process accepts a path from anywhere, and the window is never offered one.
 */

/** What somebody decided about work that is not on disk. */
export type UnsavedChangesAnswer = 'save' | 'discard' | 'cancel';

export interface AppDialogs {
  chooseThemeFolder(): Promise<string | null>;
  chooseProjectFile(): Promise<string | null>;
  chooseProjectDestination(suggestedName: string): Promise<string | null>;
  /**
   * Asks before work is lost. Native rather than drawn in the window: it is the one question
   * that must still be asked when the window is being taken away.
   */
  confirmUnsavedChanges(label: string): Promise<UnsavedChangesAnswer>;
  chooseExportFolder(): Promise<string | null>;
  /** Chooses a folder of system icons to bring in. One folder, and only what is directly in it. */
  chooseIconSetFolder(): Promise<string | null>;
  confirmIconSetReplacements(
    replacements: readonly {
      readonly label: string;
      readonly existing: string;
      readonly incoming: string;
    }[],
  ): Promise<boolean>;
  chooseArchiveFile(suggestedName: string): Promise<string | null>;
  /**
   * Chooses a file to bring into the theme. The filters are a convenience for the person
   * browsing, never a check: what the file turns out to be is decided by reading it.
   */
  chooseAssetFile(expects: 'image' | 'audio'): Promise<string | null>;
}

const ASSET_FILTERS: Readonly<Record<'image' | 'audio', Electron.FileFilter[]>> = {
  image: [
    {
      name: 'Importable images (PNG, JPEG, BMP, GIF)',
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'],
    },
    { name: 'All files', extensions: ['*'] },
  ],
  audio: [
    { name: 'ATRAC9 audio (.at9)', extensions: ['at9'] },
    { name: 'All files', extensions: ['*'] },
  ],
};

const PROJECT_FILTERS: Electron.FileFilter[] = [
  { name: 'VitaTheme project', extensions: ['vitatheme'] },
];

/**
 * In the order the platforms agree on, with the safe answer as the one a stray press gets:
 * `defaultId` saves, and dismissing the box cancels rather than discarding.
 */
const UNSAVED_ANSWERS: readonly UnsavedChangesAnswer[] = ['save', 'discard', 'cancel'];

const firstPath = (paths: readonly string[]): string | null => paths[0] ?? null;

/** Attached to the window where there is one, so the dialog belongs to the theme being edited. */
const showOpen = (
  window: BrowserWindow | null,
  options: OpenDialogOptions,
): Promise<OpenDialogReturnValue> =>
  window === null ? dialog.showOpenDialog(options) : dialog.showOpenDialog(window, options);

const showSave = (
  window: BrowserWindow | null,
  options: SaveDialogOptions,
): Promise<SaveDialogReturnValue> =>
  window === null ? dialog.showSaveDialog(options) : dialog.showSaveDialog(window, options);

export const createAppDialogs = (windowOf: () => BrowserWindow | null): AppDialogs => ({
  chooseThemeFolder: async () => {
    const result = await showOpen(windowOf(), {
      title: 'Open theme',
      message: 'Choose the folder that holds the theme',
      buttonLabel: 'Open theme',
      properties: ['openDirectory'],
    });

    return result.canceled ? null : firstPath(result.filePaths);
  },

  chooseExportFolder: async () => {
    const result = await showOpen(windowOf(), {
      title: 'Export theme',
      message: 'Choose where to put the exported theme folder',
      buttonLabel: 'Export here',
      properties: ['openDirectory', 'createDirectory'],
    });

    return result.canceled ? null : firstPath(result.filePaths);
  },

  chooseIconSetFolder: async () => {
    const result = await showOpen(windowOf(), {
      title: 'Import icon set',
      message: 'Choose a folder of system icons',
      buttonLabel: 'Use this folder',
      // One folder, and no new one: this reads what is already there.
      properties: ['openDirectory'],
    });

    return result.canceled ? null : firstPath(result.filePaths);
  },

  confirmIconSetReplacements: async (replacements) => {
    const window = windowOf();
    const options = {
      type: 'warning' as const,
      title: 'Replace custom system icons?',
      message: `${String(replacements.length)} system icon replacement${replacements.length === 1 ? '' : 's'} already exist in this theme.`,
      detail: replacements
        .map(({ label, existing, incoming }) => `${label}: ${existing} → ${incoming}`)
        .join('\n'),
      buttons: ['Cancel', 'Replace existing icons'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const result =
      window === null
        ? await dialog.showMessageBox(options)
        : await dialog.showMessageBox(window, options);
    return result.response === 1;
  },

  chooseAssetFile: async (expects) => {
    const result = await showOpen(windowOf(), {
      title: expects === 'audio' ? 'Choose background music' : 'Choose an image',
      message:
        expects === 'audio'
          ? 'Choose an existing ATRAC9 .at9 file; source audio cannot be encoded here'
          : 'PNG, JPEG, BMP and GIF can be converted to fit the selected slot',
      buttonLabel: 'Use file',
      filters: ASSET_FILTERS[expects],
      properties: ['openFile'],
    });

    return result.canceled ? null : firstPath(result.filePaths);
  },

  chooseProjectFile: async () => {
    const result = await showOpen(windowOf(), {
      title: 'Open project',
      message: 'Choose the VitaTheme project to open',
      buttonLabel: 'Open project',
      filters: PROJECT_FILTERS,
      properties: ['openFile'],
    });

    return result.canceled ? null : firstPath(result.filePaths);
  },

  chooseProjectDestination: async (suggestedName) => {
    const result = await showSave(windowOf(), {
      title: 'Save project',
      buttonLabel: 'Save',
      defaultPath: suggestedName,
      filters: PROJECT_FILTERS,
      properties: ['createDirectory'],
    });

    return result.canceled ? null : result.filePath;
  },

  confirmUnsavedChanges: async (label) => {
    const window = windowOf();
    const options = {
      type: 'warning' as const,
      title: 'Unsaved changes',
      message: `Save the changes to “${label}” before closing?`,
      detail: 'The changes are lost if they are not saved.',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    };

    const { response } =
      window === null
        ? await dialog.showMessageBox(options)
        : await dialog.showMessageBox(window, options);

    return UNSAVED_ANSWERS[response] ?? 'cancel';
  },

  chooseArchiveFile: async (suggestedName) => {
    const result = await showSave(windowOf(), {
      title: 'Export theme archive',
      buttonLabel: 'Export',
      defaultPath: suggestedName,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
      properties: ['createDirectory'],
    });

    return result.canceled ? null : result.filePath;
  },
});
