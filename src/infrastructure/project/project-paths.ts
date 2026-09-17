import { basename, dirname, extname, join } from 'node:path';

/**
 * How a project is laid out on disk.
 *
 * A project is two things beside each other: the document, and a folder holding the files it
 * refers to. They are named from the same stem so that they sort together, are obviously a
 * pair, and can be moved together without anything inside needing to change — the document
 * refers to its files by name alone, never by where they are.
 *
 *   My Theme.vitatheme            the project
 *   My Theme.assets/              the files it refers to
 *   My Theme.vitatheme.autosave   work in progress, if the application stopped unexpectedly
 *
 * Every name here is derived, never stored: nothing in a project file says where anything is.
 */

export const PROJECT_FILE_EXTENSION = '.vitatheme';
const ASSETS_FOLDER_EXTENSION = '.assets';
const RECOVERY_EXTENSION = '.autosave';

/**
 * The path a project is saved at, given what somebody chose in a save dialog.
 *
 * Adding the extension matters beyond tidiness: the assets folder is named from the stem, so
 * a project saved as `My Theme` and one saved as `My Theme.vitatheme` would otherwise be two
 * projects sharing one folder of files.
 */
export const projectFilePath = (chosenPath: string): string =>
  extname(chosenPath).toLowerCase() === PROJECT_FILE_EXTENSION
    ? chosenPath
    : `${chosenPath}${PROJECT_FILE_EXTENSION}`;

/** Where a project keeps the files it refers to: a folder beside it, named from the same stem. */
export const projectAssetsPath = (projectPath: string): string => {
  const name = basename(projectPath);
  const stem = name.slice(0, name.length - extname(name).length);
  return join(dirname(projectPath), `${stem || name}${ASSETS_FOLDER_EXTENSION}`);
};

/**
 * Where work in progress is kept for a saved project: beside it, under its own name.
 *
 * Deliberately not hidden. Somebody looking at the folder after a crash should be able to
 * see that there is something to recover, and the application says so when the project is
 * opened rather than relying on them noticing.
 */
export const projectRecoveryPath = (projectPath: string): string =>
  `${projectPath}${RECOVERY_EXTENSION}`;

/** What to call a project in the interface: its own name, never the path it was found at. */
export const projectDisplayName = (projectPath: string): string => {
  const name = basename(projectPath);
  const stem = name.slice(0, name.length - extname(name).length);
  return stem === '' ? name : stem;
};
