import { join } from 'node:path';
import { app, Menu, session as electronSession } from 'electron';
import { createAutosave, DEFAULT_AUTOSAVE_DELAY_MS } from '../application/session/autosave';
import { createThemeSession, type ExportDestination } from '../application/session/theme-session';
import { openArchiveExportTarget } from '../infrastructure/export/archive-export-target';
import { openFolderExportTarget } from '../infrastructure/export/folder-export-target';
import { fileSystemExternalFiles } from '../infrastructure/filesystem/file-system-external-file';
import { openThemeFolder } from '../infrastructure/filesystem/file-system-theme-folder';
import { workerImageConverter } from '../infrastructure/image/worker-image-converter';
import { fileSystemProjectStore } from '../infrastructure/project/file-system-project-store';
import { fileSystemRecentProjects } from '../infrastructure/project/file-system-recent-projects';
import { projectDocumentCodec } from '../infrastructure/project/project-document';
import { themeXmlCodec } from '../infrastructure/theme-xml/theme-xml-codec';
import { IPC_CHANNELS } from '../ipc/contract';
import { registerIpcHandlers } from './ipc/register-handlers';
import { buildApplicationMenu } from './menu';
import { createAppDialogs } from './app/dialogs';
import { createAppController } from './app/app-controller';
import { createShutdownPolicy } from './app/shutdown';
import {
  applyNavigationPolicy,
  createMainWindow,
  describeOpenDocument,
  getMainWindow,
} from './window';

/**
 * VitaTheme.
 *
 * This process is the only one with privileges, and it is where the application's layers are
 * put together: the session and the rules it applies know nothing about Electron, and are
 * given the filesystem adapters from here. Everything below is either wiring or a safety
 * default that has to hold for the whole application rather than for one window.
 */

const PRODUCT_NAME = 'VitaTheme';

/**
 * Where work that has never been saved anywhere is kept.
 *
 * A theme somebody started and edited has no folder of its own yet, so the application keeps
 * it in the place this platform sets aside for the application's own data. It is offered
 * back the next time VitaTheme starts, and removed as soon as the work is saved or given up.
 */
const untitledRecoveryPath = (): string =>
  join(app.getPath('userData'), 'recovery', 'untitled.vitatheme.autosave');

/**
 * The bundle that converts pictures, built beside this one.
 *
 * Resolved the same way the preload is, so it is found inside the packaged application's
 * archive rather than wherever the process happens to have been started from.
 */
const imageWorkerPath = (): string => join(app.getAppPath(), 'out', 'main', 'image-worker.js');

/** The projects somebody worked on before: a convenience, kept with the application's own data. */
const recentProjectsPath = (): string => join(app.getPath('userData'), 'recent-projects.json');

/** The infrastructure the session works through, chosen once, in the only place allowed to. */
const openExportTargetAt = (destination: ExportDestination) => {
  const options = { overwrite: destination.overwrite };

  return destination.kind === 'folder'
    ? openFolderExportTarget(destination.path, options)
    : openArchiveExportTarget(destination.path, options);
};

const startApplication = (): void => {
  const images = workerImageConverter({ workerPath: imageWorkerPath() });
  const externalFiles = fileSystemExternalFiles();

  const projects = fileSystemProjectStore({ untitledRecoveryPath: untitledRecoveryPath() });

  const session = createThemeSession({
    codec: themeXmlCodec(),
    openThemeFolderAt: openThemeFolder,
    openExportTargetAt,
    externalFiles,
    projectDocuments: projectDocumentCodec(),
    projects,
    images,
  });

  const autosave = createAutosave({
    hasUnsavedWork: () => session.current()?.isDirty === true,
    writeRecovery: () => session.writeRecovery(),
    startTimer: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      return {
        cancel: () => {
          clearTimeout(timer);
        },
      };
    },
    delayMs: DEFAULT_AUTOSAVE_DELAY_MS,
  });

  const controller = createAppController({
    session,
    dialogs: createAppDialogs(getMainWindow),
    externalFiles,
    recentProjects: fileSystemRecentProjects({ path: recentProjectsPath() }),
    projects,
    publish: (snapshot) => {
      autosave.noteChange();
      describeOpenDocument(snapshot.theme?.label ?? null, snapshot.theme?.isDirty ?? false);
      getMainWindow()?.webContents.send(IPC_CHANNELS.sessionChanged, snapshot);
    },
  });

  registerIpcHandlers(controller);
  Menu.setApplicationMenu(buildApplicationMenu(getMainWindow));

  // Unsaved work is asked about once, wherever the closing started; see ./app/shutdown.
  const shutdown = createShutdownPolicy({
    hasUnsavedWork: () => controller.hasUnsavedChanges(),
    confirmDiscard: () => controller.confirmDiscardChanges(),
    quit: () => {
      app.quit();
    },
    keepsRunningWithoutWindows: process.platform === 'darwin',
  });

  const openWindow = (): void => {
    shutdown.windowOpened();
    createMainWindow({ confirmClose: shutdown.confirmClose, onClosed: shutdown.windowsClosed });
  };

  app.on('before-quit', (event) => {
    if (!shutdown.requestQuit()) {
      event.preventDefault();
    }
  });

  app.on('will-quit', () => {
    autosave.cancel();
    void images.stop();
  });

  app.on('activate', () => {
    if (getMainWindow() === null) {
      openWindow();
    }
  });

  /**
   * The last window has gone: either the application goes with it, or it waits.
   *
   * Which of the two is not this file's decision — it depends on the platform and on whether
   * somebody asked to quit. This arrives by two routes, because Electron stops emitting it
   * once a quit is under way and the window itself has to say so instead; the policy is
   * asked the same question either way.
   */
  app.on('window-all-closed', () => {
    shutdown.windowsClosed();
  });

  openWindow();
  // Asked after the window exists, so the answers have somewhere to be shown.
  void controller.loadRecentProjects();
  void controller.detectRecovery();
};

app.setName(PRODUCT_NAME);

// A theme is opened from a folder on disk, and two windows editing the same one would be two
// answers to the same question. A second launch raises the window that is already open.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = getMainWindow();
    if (window !== null) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  });

  // Applied to every page the application ever creates, not only the first one.
  app.on('web-contents-created', (_event, contents) => {
    applyNavigationPolicy(contents);
  });

  void app.whenReady().then(() => {
    // The interface needs no camera, microphone, location or notifications, so nothing is
    // granted: a page that cannot ask cannot be tricked into asking.
    electronSession.defaultSession.setPermissionRequestHandler((_contents, _permission, grant) => {
      grant(false);
    });

    startApplication();
  });
}
