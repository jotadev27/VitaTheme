import { app, BrowserWindow, dialog, shell, type WebContents } from 'electron';
import { join } from 'node:path';
import { developmentRendererUrl } from './renderer-location';

/**
 * The application window, and the rules it runs under.
 *
 * The window renders the interface and nothing else: it has no access to Node, cannot reach
 * the filesystem, and cannot be navigated away from the application. Everything it is able
 * to do goes through the bridge the preload publishes, and every one of those is a named
 * operation this process carries out on its behalf.
 */

const PRELOAD_SCRIPT = 'preload/index.cjs';
const RENDERER_PAGE = 'renderer/index.html';

/** Dense interface: below this it stops being usable rather than merely cramped. */
const MINIMUM_WIDTH = 1024;
const MINIMUM_HEIGHT = 640;
const DEFAULT_WIDTH = 1360;
const DEFAULT_HEIGHT = 880;

/** Matches the interface background, so starting the application does not flash white. */
const WINDOW_BACKGROUND = '#0f1317';

/** Chromium's code for a navigation that was replaced by another one; not a failure. */
const NAVIGATION_ABORTED = -3;

let mainWindow: BrowserWindow | null = null;

const outputPath = (relative: string): string => join(app.getAppPath(), 'out', relative);

// The development server is never a source of UI in a packaged application, even if an
// environment variable with that name is supplied by the process that launches it.
const configuredRendererUrl = (): string | undefined =>
  developmentRendererUrl(app.isPackaged, process.env.ELECTRON_RENDERER_URL);

export const getMainWindow = (): BrowserWindow | null =>
  mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : null;

/** Only the application's own window may call the operations this process exposes. */
export const isTrustedSender = (sender: WebContents): boolean =>
  getMainWindow()?.webContents.id === sender.id;

export interface MainWindowOptions {
  /**
   * Whether the window may close, asked when somebody tries to close it.
   *
   * Work that is not on disk is the one thing the window cannot be trusted to defend, since
   * the question has to be asked while the window is being taken away. So it is asked here,
   * natively, and the answer decides whether the close goes ahead.
   */
  readonly confirmClose?: () => Promise<boolean>;
  /**
   * The window has gone.
   *
   * Told here rather than only through `window-all-closed`, which Electron does not emit
   * while the application is quitting — and quitting is precisely when asking the question
   * above cancels the quit, leaving somebody to decide what happens next.
   */
  readonly onClosed?: () => void;
}

export const createMainWindow = ({
  confirmClose,
  onClosed,
}: MainWindowOptions = {}): BrowserWindow => {
  const window = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MINIMUM_WIDTH,
    minHeight: MINIMUM_HEIGHT,
    backgroundColor: WINDOW_BACKGROUND,
    title: app.getName(),
    // The interface draws its own toolbar on macOS, where the system title bar would only
    // repeat what the toolbar already says.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    show: false,
    webPreferences: {
      preload: outputPath(PRELOAD_SCRIPT),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload itself runs sandboxed: it can talk to this process and to the page, and
      // has no more access to the machine than the page does.
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    mainWindow = null;
    onClosed?.();
  });

  // Asked once. The answer is remembered so that closing again after somebody has decided
  // does not ask them the same question a second time.
  let closeAllowed = false;
  window.on('close', (event) => {
    if (closeAllowed || confirmClose === undefined) {
      return;
    }

    event.preventDefault();
    void confirmClose().then((allowed) => {
      if (allowed) {
        closeAllowed = true;
        window.close();
      }
    });
  });

  // A window that fails to load is a blank rectangle with no way to say what went wrong,
  // so the failure is reported where the person can actually see it.
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (isMainFrame && errorCode !== NAVIGATION_ABORTED) {
        dialog.showErrorBox(
          `${app.getName()} could not start`,
          `The interface failed to load: ${errorDescription}.`,
        );
      }
    },
  );

  const rendererUrl = configuredRendererUrl();
  void (rendererUrl === undefined
    ? window.loadFile(outputPath(RENDERER_PAGE))
    : window.loadURL(rendererUrl));

  mainWindow = window;
  return window;
};

/**
 * What the window is called, and whether it is showing work that is not on disk.
 *
 * macOS marks an edited document with a dot in the close button and expects the title to
 * stay clean; elsewhere the mark goes on the title itself. Neither ever includes a path:
 * the title says which theme, not where it lives.
 */
export const describeOpenDocument = (label: string | null, edited: boolean): void => {
  const window = getMainWindow();
  if (window === null) {
    return;
  }

  const product = app.getName();
  if (process.platform === 'darwin') {
    window.setDocumentEdited(edited);
    window.setTitle(label === null ? product : `${label} — ${product}`);
    return;
  }

  window.setTitle(label === null ? product : `${edited ? '*' : ''}${label} — ${product}`);
};

/** Links are opened in the browser, never inside the application. */
const openExternally = (url: string): void => {
  if (url.startsWith('https://')) {
    void shell.openExternal(url);
  }
};

/**
 * Applied to every page this application ever creates, not only the first one: a window that
 * can be navigated somewhere else is a window running somebody else's code next to the
 * bridge.
 */
export const applyNavigationPolicy = (contents: WebContents): void => {
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    const allowed = configuredRendererUrl();
    if (allowed === undefined || !url.startsWith(allowed)) {
      event.preventDefault();
      openExternally(url);
    }
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
};
