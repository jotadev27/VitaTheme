import { basename, join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExportDestination,
  LoadedTheme,
  SessionExportOutcome,
  ThemeSession,
} from '@/application/session/theme-session';
import type { ThemeAssetReadError } from '@/application/ports/theme-assets';
import type { RecoveryLocation } from '@/application/ports/project-store';
import type { RecentProject as StoredRecentProject } from '@/application/ports/recent-projects-store';
import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type { ThemeEdit } from '@/domain/editing/theme-edit';
import type { MediaDescriptor } from '@/domain/model/media';
import type { ThemeAssetSummary } from '@/domain/validation/asset-inventory';
import type { ThemePreviewKind } from '@/domain/vita/theme-previews';
import type { Result } from '@/domain/shared/result';
import { validationReport } from '@/domain/validation/report';
import { validationError } from '@/domain/validation/issue';
import { themeExportFailure } from '@/application/ports/theme-export-target';
import type { SessionSnapshot } from '@/ipc';
import { createAppController, type AppController } from '@/main/app/app-controller';
import type { AppDialogs, UnsavedChangesAnswer } from '@/main/app/dialogs';
import { aThemeProject } from '../support/theme-fixtures';

/**
 * What the window asks for, and what it is told back.
 *
 * Electron is stubbed out: the point of these tests is the part in between, where a request
 * with no path in it turns into a location on disk, and where what comes back is stripped of
 * everything the window has no business knowing.
 */
const showItemInFolder = vi.fn<(path: string) => void>();
vi.mock('electron', () => ({
  shell: {
    showItemInFolder: (path: string): void => {
      showItemInFolder(path);
    },
  },
}));

const CHOSEN_FOLDER = join('/private/somewhere', 'Documents');
const CHOSEN_ARCHIVE = join(CHOSEN_FOLDER, 'Example Theme.zip');
const CHOSEN_ASSET = join(CHOSEN_FOLDER, 'artwork', 'chosen-by-somebody.png');
const CHOSEN_ICON_SET = join(CHOSEN_FOLDER, 'artwork', 'an icon set');

/**
 * Files outside the theme, as far as the controller is concerned.
 *
 * Only the folder listing matters here: what happens to each file afterwards is the
 * session's business and is tested where that lives.
 */
const fileStoreStub = () => {
  let entries: readonly { name: string; location: string }[] = [];
  let failure: string | null = null;

  return {
    inspect: () =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'unreadable' as const, message: 'not used here' },
      }),
    read: () =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'unreadable' as const, message: 'not used here' },
      }),
    listFolder: (path: string) => {
      listedFolders.push(path);
      return Promise.resolve(
        failure === null
          ? { ok: true as const, value: entries }
          : { ok: false as const, error: { code: 'unreadable' as const, message: failure } },
      );
    },
    /** What the chosen folder holds, for a test to arrange. */
    setEntries: (names: readonly string[]) => {
      entries = names.map((name) => ({ name, location: join(CHOSEN_ICON_SET, name) }));
    },
    fail: (message: string) => {
      failure = message;
    },
  };
};

const listedFolders: string[] = [];
const CHOSEN_PROJECT = join(CHOSEN_FOLDER, 'Example Theme.vitatheme');

const aJpeg = (width: number, height: number): MediaDescriptor => ({
  kind: 'image',
  format: 'jpeg',
  width,
  height,
  encoding: null,
});

const anIndexedPng = (width: number, height: number): MediaDescriptor => ({
  kind: 'image',
  format: 'png',
  width,
  height,
  encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: false },
});

const aLoadedTheme = (overrides: Partial<LoadedTheme> = {}): LoadedTheme => ({
  origin: 'folder',
  label: 'Example Theme',
  project: aThemeProject(),
  report: validationReport([]),
  assets: [],
  canUndo: false,
  canRedo: false,
  revision: 1,
  assetRevision: 1,
  isDirty: false,
  ...overrides,
});

interface SessionStub extends ThemeSession {
  readonly exports: ExportDestination[];
  readonly opened: { path: string; label: string }[];
  readonly openedProjects: { path: string; label: string }[];
  readonly saves: { path: string; label: string }[];
  readonly recoveriesOpened: RecoveryLocation[];
  readonly recoveriesDiscarded: RecoveryLocation[];
  readonly edits: ThemeEdit[];
  readonly historyCalls: ('undo' | 'redo')[];
  readonly assignments: { slot: ThemeAssetSlot; location: string }[];
  /** Every set of files handed over at once, so a test can see it was one call. */
  readonly bulkAssignments: { slot: ThemeAssetSlot; displayName: string }[][];
  readonly conversions: { slot: ThemeAssetSlot; fit: string }[];
  /** Every set of previews asked for at once, so a test can see it was one call. */
  readonly previewRequests: ThemePreviewKind[][];
  conversionFailure: string | null;
  previewFailure: string | null;
  refusedPreviews: { kind: ThemePreviewKind; message: string }[];
  assetBytes: Result<Uint8Array, ThemeAssetReadError> | null;
  outcome: SessionExportOutcome | null;
  loaded: LoadedTheme | null;
  location: string | null;
  recoveryWaiting: boolean;
  saveFailure: string | null;
  recoveryFailure: string | null;
  openFailure: string | null;
  assignFailure: string | null;
}

const sessionStub = (): SessionStub => {
  const exports: ExportDestination[] = [];
  const opened: { path: string; label: string }[] = [];

  const stub: SessionStub = {
    exports,
    opened,
    openedProjects: [],
    bulkAssignments: [],
    saves: [],
    recoveriesOpened: [],
    recoveriesDiscarded: [],
    location: null,
    recoveryWaiting: false,
    saveFailure: null,
    recoveryFailure: null,
    openFailure: null,
    assignFailure: null,
    edits: [],
    historyCalls: [],
    assignments: [],
    conversions: [],
    previewRequests: [],
    conversionFailure: null,
    previewFailure: null,
    refusedPreviews: [],
    assetBytes: null,
    outcome: {
      status: 'exported',
      report: validationReport([]),
      summary: { fileCount: 3, totalBytes: 2048, assetPaths: [] },
    },
    loaded: aLoadedTheme(),

    current: () => stub.loaded,
    openFolder: (path, label) => {
      opened.push({ path, label });
      stub.loaded = aLoadedTheme({ label });
      return Promise.resolve({ ok: true, value: stub.loaded });
    },
    startDraft: (metadata) => {
      stub.loaded = aLoadedTheme({ origin: 'draft', label: metadata.title });
      return stub.loaded;
    },
    refresh: () => Promise.resolve(stub.loaded),
    close: () => {
      stub.loaded = null;
      stub.location = null;
      return Promise.resolve();
    },

    openProject: (path, label) => {
      if (stub.openFailure !== null) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'not-found' as const, message: stub.openFailure },
        });
      }

      stub.openedProjects.push({ path, label });
      stub.loaded = aLoadedTheme({ origin: 'project', label });
      stub.location = path;
      return Promise.resolve({ ok: true, value: stub.loaded });
    },

    saveTo: (path, label) => {
      if (stub.saveFailure !== null) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'write-failed' as const, message: stub.saveFailure },
        });
      }

      stub.saves.push({ path, label });
      stub.location = path;
      stub.loaded = aLoadedTheme({ origin: 'project', label, isDirty: false });
      return Promise.resolve({ ok: true as const, value: stub.loaded });
    },

    projectLocation: () => stub.location,

    hasRecovery: () => Promise.resolve(stub.recoveryWaiting),

    openRecovery: (location, label) => {
      stub.recoveriesOpened.push(location);
      if (stub.recoveryFailure !== null) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'malformed' as const, message: stub.recoveryFailure },
        });
      }

      stub.loaded = aLoadedTheme({
        origin: location.kind === 'project' ? 'project' : 'draft',
        label: label ?? 'Recovered theme',
        isDirty: true,
      });
      return Promise.resolve({ ok: true as const, value: stub.loaded });
    },

    writeRecovery: () => Promise.resolve(true),

    discardRecovery: (location) => {
      stub.recoveriesDiscarded.push(location);
      return Promise.resolve();
    },
    exportTo: (destination) => {
      exports.push(destination);
      return Promise.resolve(stub.outcome);
    },
    applyEdit: (edit) => {
      stub.edits.push(edit);
      return Promise.resolve(
        stub.loaded === null
          ? {
              ok: false as const,
              error: { code: 'no-theme-open' as const, message: 'No theme is open.' },
            }
          : { ok: true as const, value: stub.loaded },
      );
    },
    assignAssets: (given) => {
      stub.bulkAssignments.push(given.map(({ slot, displayName }) => ({ slot, displayName })));
      return Promise.resolve(
        stub.loaded === null
          ? {
              ok: false as const,
              error: { code: 'no-theme-open' as const, message: 'No theme is open.' },
            }
          : {
              ok: true as const,
              value: {
                theme: stub.loaded,
                assigned: given.map(({ slot, displayName }) => ({ slot, displayName })),
                rejected: [],
              },
            },
      );
    },
    assignAsset: (slot, location) => {
      if (stub.assignFailure !== null) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'unreadable' as const, message: stub.assignFailure },
        });
      }

      stub.assignments.push({ slot, location });
      return Promise.resolve(
        stub.loaded === null
          ? {
              ok: false as const,
              error: { code: 'no-theme-open' as const, message: 'No theme is open.' },
            }
          : { ok: true as const, value: stub.loaded },
      );
    },
    generatePreviews: (kinds) => {
      stub.previewRequests.push([...kinds]);
      if (stub.previewFailure !== null) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'no-theme-open' as const, message: stub.previewFailure },
        });
      }

      stub.loaded = aLoadedTheme({ isDirty: true, assetRevision: 2 });
      return Promise.resolve({
        ok: true as const,
        value: {
          theme: stub.loaded,
          generated: kinds.map((kind) => ({
            kind,
            result: { byteSize: 40_000, media: anIndexedPng(480, 272) },
          })),
          refused: stub.refusedPreviews,
        },
      });
    },
    generatePageThumbnail: () =>
      Promise.resolve(
        stub.loaded === null
          ? {
              ok: false as const,
              error: { code: 'no-theme-open' as const, message: 'No theme is open.' },
            }
          : { ok: true as const, value: stub.loaded },
      ),
    convertAsset: (slot, fit) => {
      stub.conversions.push({ slot, fit });
      if (stub.conversionFailure !== null) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'undecodable' as const, message: stub.conversionFailure },
        });
      }

      stub.loaded = aLoadedTheme({ isDirty: true, assetRevision: 2 });
      return Promise.resolve({
        ok: true as const,
        value: {
          theme: stub.loaded,
          source: { byteSize: 400_000, media: aJpeg(1920, 1080) },
          result: { byteSize: 80_000, media: anIndexedPng(960, 512) },
        },
      });
    },
    convertIncompatibleImages: () =>
      Promise.resolve({
        ok: true as const,
        value: { theme: stub.loaded ?? aLoadedTheme(), converted: [], regeneratedThumbnails: 0 },
      }),

    readAsset: () => Promise.resolve(stub.assetBytes),
    undo: () => {
      stub.historyCalls.push('undo');
      return Promise.resolve(stub.loaded);
    },
    redo: () => {
      stub.historyCalls.push('redo');
      return Promise.resolve(stub.loaded);
    },
  };

  return stub;
};

interface DialogStub extends AppDialogs {
  cancel: () => void;
  answer: UnsavedChangesAnswer;
  readonly asked: string[];
}

const dialogStub = (): DialogStub => {
  let cancelled = false;

  const stub: DialogStub = {
    cancel: () => {
      cancelled = true;
    },
    answer: 'discard',
    asked: [],
    chooseThemeFolder: () =>
      Promise.resolve(cancelled ? null : join(CHOSEN_FOLDER, 'Example Theme')),
    chooseExportFolder: () => Promise.resolve(cancelled ? null : CHOSEN_FOLDER),
    chooseArchiveFile: () => Promise.resolve(cancelled ? null : CHOSEN_ARCHIVE),
    chooseAssetFile: () => Promise.resolve(cancelled ? null : CHOSEN_ASSET),
    chooseIconSetFolder: () => Promise.resolve(cancelled ? null : CHOSEN_ICON_SET),
    confirmIconSetReplacements: () => Promise.resolve(!cancelled),
    chooseProjectFile: () => Promise.resolve(cancelled ? null : CHOSEN_PROJECT),
    chooseProjectDestination: () => Promise.resolve(cancelled ? null : CHOSEN_PROJECT),
    confirmUnsavedChanges: (label) => {
      stub.asked.push(label);
      return Promise.resolve(stub.answer);
    },
  };

  return stub;
};

/** The list of recent projects, held in memory rather than in a file. */
const recentsStub = () => {
  let entries: readonly StoredRecentProject[] = [];

  return {
    read: () => Promise.resolve(entries),
    write: (next: readonly StoredRecentProject[]) => {
      entries = next;
      return Promise.resolve();
    },
    /** What is on disk, for a test to arrange or inspect. */
    entries: () => entries,
    set: (next: readonly StoredRecentProject[]) => {
      entries = next;
    },
  };
};

let session: SessionStub;
let dialogs: ReturnType<typeof dialogStub>;
let recents: ReturnType<typeof recentsStub>;
let missingProjects: Set<string>;
let published: SessionSnapshot[];
let controller: AppController;
let clock: number;
let ids: number;
let fileStore: ReturnType<typeof fileStoreStub>;

const buildController = (): AppController =>
  createAppController({
    session,
    dialogs,
    externalFiles: fileStore,
    publish: (snapshot) => published.push(snapshot),
    recentProjects: recents,
    projects: { exists: (path) => Promise.resolve(!missingProjects.has(path)) },
    now: () => (clock += 1000),
    newRecentId: () => `aaaa${String((ids += 1)).padStart(4, '0')}`,
  });

beforeEach(() => {
  showItemInFolder.mockClear();
  session = sessionStub();
  dialogs = dialogStub();
  recents = recentsStub();
  fileStore = fileStoreStub();
  listedFolders.length = 0;
  missingProjects = new Set();
  published = [];
  clock = 1_700_000_000_000;
  ids = 0;
  controller = buildController();
});

describe('bringing in a folder of system icons', () => {
  beforeEach(() => {
    session.loaded = aLoadedTheme({ label: 'Midnight' });
  });

  it('reads the folder somebody chose, and no other', async () => {
    fileStore.setEntries(['icon_web.png', 'icon_settings.png']);

    const result = await controller.importIconSet();

    expect(listedFolders).toEqual([CHOSEN_ICON_SET]);
    expect(result.status).toBe('imported');
  });

  it('hands the whole set over at once, so it is one change', async () => {
    fileStore.setEntries(['icon_web.png', 'icon_settings.png', 'icon_music.png']);

    await controller.importIconSet();

    expect(session.bulkAssignments).toHaveLength(1);
    expect(session.bulkAssignments[0]).toHaveLength(3);
  });

  it('says nothing happened when the dialog was dismissed', async () => {
    dialogs.cancel();

    const result = await controller.importIconSet();

    expect(result.status).toBe('cancelled');
    expect(session.bulkAssignments).toEqual([]);
    expect(published).toEqual([]);
  });

  it('refuses when no theme is open', async () => {
    session.loaded = null;

    const result = await controller.importIconSet();

    expect(result).toEqual({ status: 'rejected', message: 'No theme is open.' });
    expect(listedFolders).toEqual([]);
  });

  it('reports a folder that could not be read', async () => {
    fileStore.fail('That folder could not be read.');

    const result = await controller.importIconSet();

    expect(result).toEqual({ status: 'rejected', message: 'That folder could not be read.' });
  });

  it('tells the window what happened without telling it where', async () => {
    fileStore.setEntries(['icon_web.png', 'family.png']);

    const result = await controller.importIconSet();

    expect(result.status).toBe('imported');
    if (result.status !== 'imported') return;
    expect(result.summary.applied).toEqual([{ slot: 'browser', name: 'icon_web.png' }]);
    expect(result.summary.ignored).toEqual(['family.png']);
    expect(JSON.stringify(result)).not.toContain(CHOSEN_FOLDER);
  });

  it('shows the window the theme afterwards', async () => {
    fileStore.setEntries(['icon_web.png']);

    await controller.importIconSet();

    expect(published).toHaveLength(1);
  });
});

describe('opening a theme', () => {
  it('names the theme after the folder, not after the path to it', async () => {
    const result = await controller.openThemeFolder();

    expect(result).toEqual({ status: 'loaded' });
    expect(session.opened).toEqual([
      { path: join(CHOSEN_FOLDER, 'Example Theme'), label: 'Example Theme' },
    ]);
  });

  it('is cancelled, not failed, when nobody chose a folder', async () => {
    dialogs.cancel();

    expect(await controller.openThemeFolder()).toEqual({ status: 'cancelled' });
    expect(session.opened).toEqual([]);
  });

  it('tells the window about the new session', async () => {
    await controller.openThemeFolder();

    expect(published.at(-1)?.theme).toMatchObject({ label: 'Example Theme', origin: 'folder' });
  });
});

describe('exporting', () => {
  it('puts the theme inside the chosen folder, under a name made from its title', async () => {
    await controller.runExport({ format: 'folder' });

    expect(session.exports).toEqual([
      { kind: 'folder', path: join(CHOSEN_FOLDER, 'Example Theme'), overwrite: false },
    ]);
  });

  it('writes an archive exactly where the save dialog said', async () => {
    await controller.runExport({ format: 'archive' });

    // The system's save panel has already asked about replacing an existing file.
    expect(session.exports).toEqual([{ kind: 'archive', path: CHOSEN_ARCHIVE, overwrite: true }]);
  });

  it('reports what was written without saying where', async () => {
    const result = await controller.runExport({ format: 'folder' });

    expect(result).toEqual({
      status: 'exported',
      record: { format: 'folder', name: 'Example Theme', fileCount: 3, totalBytes: 2048 },
    });
  });

  it('asks before replacing something that is already there', async () => {
    session.outcome = {
      status: 'failed',
      failure: themeExportFailure('destination-exists', '"Example Theme" already exists.'),
    };

    const result = await controller.runExport({ format: 'folder' });

    expect(result).toEqual({
      status: 'needs-confirmation',
      name: 'Example Theme',
      format: 'folder',
    });
  });

  it('repeats the same export once told to replace, and only then', async () => {
    session.outcome = {
      status: 'failed',
      failure: themeExportFailure('destination-exists', 'already there'),
    };
    await controller.runExport({ format: 'folder' });

    session.outcome = {
      status: 'exported',
      report: validationReport([]),
      summary: { fileCount: 3, totalBytes: 2048, assetPaths: [] },
    };
    const result = await controller.confirmExportReplacement();

    expect(result.status).toBe('exported');
    expect(session.exports.at(-1)).toEqual({
      kind: 'folder',
      path: join(CHOSEN_FOLDER, 'Example Theme'),
      overwrite: true,
    });
  });

  it('has nothing to confirm when nothing was waiting', async () => {
    expect(await controller.confirmExportReplacement()).toEqual({ status: 'cancelled' });
  });

  it('forgets the pending replacement once it has been carried out', async () => {
    session.outcome = {
      status: 'failed',
      failure: themeExportFailure('destination-exists', 'already there'),
    };
    await controller.runExport({ format: 'folder' });

    session.outcome = {
      status: 'exported',
      report: validationReport([]),
      summary: { fileCount: 3, totalBytes: 2048, assetPaths: [] },
    };
    await controller.confirmExportReplacement();

    expect(await controller.confirmExportReplacement()).toEqual({ status: 'cancelled' });
  });

  it('says how many problems stopped a blocked export', async () => {
    session.outcome = {
      status: 'blocked',
      report: validationReport([
        validationError('asset.missing', 'home.pages[0].background', 'missing'),
        validationError('metadata.title-empty', 'metadata.title', 'no name'),
      ]),
    };

    expect(await controller.runExport({ format: 'folder' })).toEqual({
      status: 'blocked',
      errorCount: 2,
    });
  });

  it('passes on a failure in the words the format layer used', async () => {
    session.outcome = {
      status: 'failed',
      failure: themeExportFailure('destination-unwritable', 'The folder is read-only.'),
    };

    expect(await controller.runExport({ format: 'folder' })).toEqual({
      status: 'failed',
      message: 'The folder is read-only.',
    });
  });

  it('refuses to export when no theme is open', async () => {
    session.loaded = null;

    expect(await controller.runExport({ format: 'folder' })).toMatchObject({ status: 'failed' });
    expect(session.exports).toEqual([]);
  });
});

describe('showing the last export', () => {
  it('has nothing to show before anything has been exported', () => {
    expect(controller.revealLastExport()).toBe(false);
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('remembers where the export went, so the window never has to', async () => {
    await controller.runExport({ format: 'folder' });

    expect(controller.revealLastExport()).toBe(true);
    expect(showItemInFolder).toHaveBeenCalledWith(join(CHOSEN_FOLDER, 'Example Theme'));
  });

  it('forgets it when the theme is closed', async () => {
    await controller.runExport({ format: 'folder' });
    await controller.closeTheme();

    expect(controller.revealLastExport()).toBe(false);
    expect(controller.describeSession()).toEqual({
      theme: null,
      lastExport: null,
      recovery: null,
      recentProjects: [],
    });
  });
});

describe('what reaches the window', () => {
  it('never contains a location on this machine', async () => {
    await controller.openThemeFolder();
    await controller.runExport({ format: 'folder' });
    await controller.runExport({ format: 'archive' });

    const everythingPublished = JSON.stringify(published);
    expect(everythingPublished).not.toContain(CHOSEN_FOLDER);
    expect(everythingPublished).not.toContain('/private');
  });
});

describe('changing a theme', () => {
  it('passes the change on and tells the window the session moved', async () => {
    const result = await controller.applyEdit({ kind: 'add-page' });

    expect(result).toEqual({ status: 'applied' });
    expect(session.edits).toEqual([{ kind: 'add-page' }]);
    expect(published).toHaveLength(1);
  });

  it('reports a refused change in the words the format layer used', async () => {
    session.loaded = null;

    const result = await controller.applyEdit({ kind: 'add-page' });

    expect(result).toEqual({ status: 'rejected', message: 'No theme is open.' });
  });
});

describe('bringing a file into a theme', () => {
  const slot = { kind: 'appIcon', application: 'browser' } as const;

  it('asks for a file and hands what was chosen to the session', async () => {
    const result = await controller.assignAsset(slot);

    expect(result).toEqual({ status: 'assigned' });
    expect(session.assignments).toEqual([{ slot, location: CHOSEN_ASSET }]);
  });

  it('is cancelled, not failed, when nobody chose a file', async () => {
    dialogs.cancel();

    expect(await controller.assignAsset(slot)).toEqual({ status: 'cancelled' });
    expect(session.assignments).toEqual([]);
  });

  it('does not even open a dialog when there is no theme to put a file in', async () => {
    session.loaded = null;

    expect(await controller.assignAsset(slot)).toMatchObject({ status: 'rejected' });
    expect(session.assignments).toEqual([]);
  });

  it('never tells the window where the file came from', async () => {
    await controller.assignAsset(slot);

    const everythingPublished = JSON.stringify(published);
    expect(everythingPublished).not.toContain(CHOSEN_ASSET);
    expect(everythingPublished).not.toContain('/private');
  });
});

describe('showing the window what a file looks like', () => {
  const aPngSummary = (byteSize: number): ThemeAssetSummary => ({
    path: 'icon-browser.png' as ThemeAssetSummary['path'],
    usages: ['appIcon'],
    locations: ['home.appIcons.browser'],
    lookup: {
      status: 'found',
      asset: {
        byteSize,
        media: { kind: 'image', format: 'png', width: 128, height: 128, encoding: null },
      },
    },
  });

  const withAsset = (summary: ThemeAssetSummary, bytes: Uint8Array | null): void => {
    session.loaded = aLoadedTheme({ assets: [summary] });
    session.assetBytes = bytes === null ? null : { ok: true, value: bytes };
  };

  it('answers with the picture itself, and nothing about where it is', async () => {
    withAsset(aPngSummary(4), Uint8Array.from([1, 2, 3, 4]));

    const preview = await controller.previewAsset('icon-browser.png' as never);

    expect(preview).toEqual({ dataUrl: 'data:image/png;base64,AQIDBA==' });
  });

  it('has nothing to show for a file the theme does not have', async () => {
    withAsset(aPngSummary(4), Uint8Array.from([1]));

    expect(await controller.previewAsset('somewhere-else.png' as never)).toBeNull();
  });

  it('has nothing to show for a file that is not an image', async () => {
    withAsset(
      {
        ...aPngSummary(4),
        lookup: {
          status: 'found',
          asset: {
            byteSize: 4,
            media: { kind: 'audio', format: 'at9', sampleRate: 48000, channelCount: 2 },
          },
        },
      },
      Uint8Array.from([1, 2, 3, 4]),
    );

    expect(await controller.previewAsset('icon-browser.png' as never)).toBeNull();
  });

  it('has nothing to show for a file that was never found', async () => {
    withAsset({ ...aPngSummary(4), lookup: { status: 'missing' } }, Uint8Array.from([1]));

    expect(await controller.previewAsset('icon-browser.png' as never)).toBeNull();
  });

  it('refuses to turn an unreasonably large file into a message', async () => {
    withAsset(aPngSummary(64 * 1024 * 1024), Uint8Array.from([1]));

    expect(await controller.previewAsset('icon-browser.png' as never)).toBeNull();
  });

  it('has nothing to show when the file could not be read after all', async () => {
    session.loaded = aLoadedTheme({ assets: [aPngSummary(4)] });
    session.assetBytes = {
      ok: false,
      error: { code: 'unreadable', message: 'It could not be read.' },
    };

    expect(await controller.previewAsset('icon-browser.png' as never)).toBeNull();
  });
});

describe('taking a change back', () => {
  it('asks the session, and tells the window what resulted', async () => {
    await controller.undo();

    expect(session.historyCalls).toEqual(['undo']);
    expect(published).toHaveLength(1);
  });

  it('puts it back the same way', async () => {
    await controller.redo();

    expect(session.historyCalls).toEqual(['redo']);
    expect(published).toHaveLength(1);
  });

  it('still tells the window where things stand when there was nothing to take back', async () => {
    session.loaded = null;

    await controller.undo();

    // Nothing happened, and the window is told so rather than being left to assume it.
    expect(published.at(-1)).toEqual({
      theme: null,
      lastExport: null,
      recovery: null,
      recentProjects: [],
    });
  });

  it('says whether there is anything to take back', () => {
    session.loaded = aLoadedTheme({ canUndo: true, canRedo: false });

    expect(controller.describeSession().theme).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('never says where anything is while doing it', async () => {
    await controller.undo();
    await controller.redo();

    expect(JSON.stringify(published)).not.toContain(CHOSEN_FOLDER);
  });
});

describe('saving a project', () => {
  it('asks where to put a theme that has never been saved, and saves there', async () => {
    session.loaded = aLoadedTheme({ origin: 'draft', label: 'Midnight', isDirty: true });

    const result = await controller.saveProject();

    expect(result).toEqual({ status: 'saved', name: 'Example Theme.vitatheme' });
    expect(session.saves).toEqual([{ path: CHOSEN_PROJECT, label: 'Example Theme' }]);
  });

  it('saves a project that already has somewhere to live without asking again', async () => {
    session.location = join(CHOSEN_FOLDER, 'Saved Theme.vitatheme');
    session.loaded = aLoadedTheme({ origin: 'project', label: 'Saved Theme', isDirty: true });

    await controller.saveProject();

    expect(session.saves).toEqual([
      { path: join(CHOSEN_FOLDER, 'Saved Theme.vitatheme'), label: 'Saved Theme' },
    ]);
  });

  it('always asks when told to save as', async () => {
    session.location = join(CHOSEN_FOLDER, 'Saved Theme.vitatheme');

    await controller.saveProjectAs();

    expect(session.saves).toEqual([{ path: CHOSEN_PROJECT, label: 'Example Theme' }]);
  });

  it('is cancelled, not failed, when nobody chose where to save', async () => {
    dialogs.cancel();

    expect(await controller.saveProjectAs()).toEqual({ status: 'cancelled' });
    expect(session.saves).toEqual([]);
  });

  it('reports a save that failed, and says nothing about where', async () => {
    session.saveFailure = 'The project could not be written: permission denied.';

    const result = await controller.saveProjectAs();

    expect(result).toEqual({ status: 'failed', message: session.saveFailure });
    expect(JSON.stringify(result)).not.toContain(CHOSEN_FOLDER);
  });

  it('refuses to save when there is no theme open', async () => {
    session.loaded = null;

    expect(await controller.saveProject()).toEqual({
      status: 'failed',
      message: 'No theme is open.',
    });
  });

  it('tells the window the work is safe once it is', async () => {
    session.loaded = aLoadedTheme({ isDirty: true });

    await controller.saveProjectAs();

    expect(published.at(-1)?.theme).toMatchObject({ origin: 'project', isDirty: false });
  });
});

describe('opening a project', () => {
  it('opens what was chosen, named after the project rather than the path to it', async () => {
    const result = await controller.openProject();

    expect(result).toEqual({ status: 'loaded' });
    expect(session.openedProjects).toEqual([{ path: CHOSEN_PROJECT, label: 'Example Theme' }]);
  });

  it('is cancelled, not failed, when nobody chose a project', async () => {
    dialogs.cancel();

    expect(await controller.openProject()).toEqual({ status: 'cancelled' });
    expect(session.openedProjects).toEqual([]);
  });
});

describe('work that is not on disk', () => {
  beforeEach(() => {
    session.loaded = aLoadedTheme({ label: 'Midnight', isDirty: true });
  });

  it('asks before the theme is closed, and keeps it when the answer is to stop', async () => {
    dialogs.answer = 'cancel';

    await controller.closeTheme();

    expect(dialogs.asked).toEqual(['Midnight']);
    expect(controller.describeSession().theme).not.toBeNull();
  });

  it('closes when the work is given up, and gives up what was kept to recover it', async () => {
    dialogs.answer = 'discard';

    await controller.closeTheme();

    expect(controller.describeSession().theme).toBeNull();
    expect(session.recoveriesDiscarded).toEqual([{ kind: 'untitled' }]);
  });

  it('saves first when that is the answer, and then closes', async () => {
    dialogs.answer = 'save';

    await controller.closeTheme();

    expect(session.saves).toEqual([{ path: CHOSEN_PROJECT, label: 'Example Theme' }]);
    expect(controller.describeSession().theme).toBeNull();
  });

  it('keeps everything when the save that was asked for fails', async () => {
    dialogs.answer = 'save';
    session.saveFailure = 'The project could not be written.';

    expect(await controller.confirmDiscardChanges()).toBe(false);
    expect(controller.describeSession().theme).not.toBeNull();
  });

  it('keeps everything when the save that was asked for is called off', async () => {
    dialogs.answer = 'save';
    dialogs.cancel();

    expect(await controller.confirmDiscardChanges()).toBe(false);
  });

  it('asks before another theme takes its place', async () => {
    dialogs.answer = 'cancel';

    expect(await controller.openThemeFolder()).toEqual({ status: 'cancelled' });
    expect(await controller.openProject()).toEqual({ status: 'cancelled' });
    expect(await controller.startDraft({ title: 'Other', provider: '' })).toEqual({
      status: 'cancelled',
    });
    expect(session.opened).toEqual([]);
    expect(session.openedProjects).toEqual([]);
  });

  it('asks nothing when there is nothing unsaved', async () => {
    session.loaded = aLoadedTheme({ isDirty: false });

    expect(await controller.confirmDiscardChanges()).toBe(true);
    expect(dialogs.asked).toEqual([]);
  });

  it('says whether closing now would lose anything', () => {
    expect(controller.hasUnsavedChanges()).toBe(true);

    session.loaded = aLoadedTheme({ isDirty: false });

    expect(controller.hasUnsavedChanges()).toBe(false);
  });
});

describe('work an interrupted session left behind', () => {
  it('offers back work that was never saved anywhere, at startup', async () => {
    session.loaded = null;
    session.recoveryWaiting = true;

    await controller.detectRecovery();

    expect(published.at(-1)?.recovery).toEqual({ kind: 'untitled', label: 'Unsaved theme' });
  });

  it('offers nothing when there is nothing to offer', async () => {
    session.loaded = null;

    await controller.detectRecovery();

    expect(controller.describeSession().recovery).toBeNull();
  });

  it('offers back the work kept for a project when that project is opened', async () => {
    session.recoveryWaiting = true;

    await controller.openProject();

    expect(published.at(-1)?.recovery).toEqual({ kind: 'project', label: 'Example Theme' });
  });

  it('opens the work when it is taken back, and stops offering it', async () => {
    session.recoveryWaiting = true;
    await controller.openProject();

    const result = await controller.recoverProject();

    expect(result).toEqual({ status: 'loaded' });
    expect(session.recoveriesOpened).toEqual([{ kind: 'project', path: CHOSEN_PROJECT }]);
    expect(controller.describeSession().recovery).toBeNull();
    expect(controller.describeSession().theme).toMatchObject({ isDirty: true });
  });

  it('removes the work when it is given up, and leaves the project alone', async () => {
    session.recoveryWaiting = true;
    await controller.openProject();

    await controller.discardRecovery();

    expect(session.recoveriesDiscarded).toEqual([{ kind: 'project', path: CHOSEN_PROJECT }]);
    expect(controller.describeSession().recovery).toBeNull();
    expect(controller.describeSession().theme).not.toBeNull();
  });

  it('reports work that could not be read back, leaving the project open', async () => {
    session.recoveryWaiting = true;
    await controller.openProject();
    session.recoveryFailure = 'The project file is damaged and could not be read.';

    const result = await controller.recoverProject();

    expect(result).toEqual({ status: 'failed', message: session.recoveryFailure });
    expect(controller.describeSession().theme).not.toBeNull();
  });

  it('says nothing about where the work is being kept', async () => {
    session.recoveryWaiting = true;
    await controller.openProject();

    expect(JSON.stringify(controller.describeSession())).not.toContain(CHOSEN_FOLDER);
  });
});

describe('converting what is in a slot', () => {
  it('asks the session for the slot the window named, and how it should fit', async () => {
    const result = await controller.convertAsset({
      slot: { kind: 'liveAreaBackground', page: 0 },
      fit: 'contain',
    });

    expect(result.status).toBe('converted');
    expect(session.conversions).toEqual([
      { slot: { kind: 'liveAreaBackground', page: 0 }, fit: 'contain' },
    ]);
  });

  it('reports what the picture was and what it became', async () => {
    const result = await controller.convertAsset({
      slot: { kind: 'appIcon', application: 'browser' },
      fit: 'cover',
    });

    expect(result).toEqual({
      status: 'converted',
      report: {
        source: { byteSize: 400_000, media: aJpeg(1920, 1080) },
        result: { byteSize: 80_000, media: anIndexedPng(960, 512) },
      },
    });
  });

  it('tells the window the theme changed, so the picture on screen is the new one', async () => {
    await controller.convertAsset({ slot: { kind: 'liveAreaBackground', page: 0 }, fit: 'cover' });

    expect(published.at(-1)?.theme).toMatchObject({ isDirty: true, assetRevision: 2 });
  });

  it('passes a refusal on without changing anything', async () => {
    session.conversionFailure = 'That image could not be read.';

    const result = await controller.convertAsset({
      slot: { kind: 'liveAreaBackground', page: 0 },
      fit: 'cover',
    });

    expect(result).toEqual({ status: 'rejected', message: 'That image could not be read.' });
    expect(published).toHaveLength(0);
  });

  it('says nothing about where any file is', async () => {
    const result = await controller.convertAsset({
      slot: { kind: 'liveAreaBackground', page: 0 },
      fit: 'cover',
    });

    expect(JSON.stringify(result)).not.toContain(CHOSEN_FOLDER);
    expect(JSON.stringify(result)).not.toContain('/');
  });
});

describe('drawing the previews a theme is browsed by', () => {
  it('asks the session for exactly the previews the window named, in one call', async () => {
    const result = await controller.generatePreviews({
      kinds: ['homePreview', 'packageThumbnail'],
    });

    expect(result.status).toBe('generated');
    expect(session.previewRequests).toEqual([['homePreview', 'packageThumbnail']]);
  });

  it('reports what was drawn and what was not', async () => {
    session.refusedPreviews = [
      { kind: 'startScreenPreview', message: 'Add a lock screen wallpaper first.' },
    ];

    const result = await controller.generatePreviews({ kinds: ['homePreview'] });

    expect(result).toEqual({
      status: 'generated',
      summary: {
        generated: [
          { kind: 'homePreview', result: { byteSize: 40_000, media: anIndexedPng(480, 272) } },
        ],
        refused: [{ kind: 'startScreenPreview', message: 'Add a lock screen wallpaper first.' }],
      },
    });
  });

  it('tells the window the theme changed, so the pictures on screen are the new ones', async () => {
    await controller.generatePreviews({ kinds: ['homePreview'] });

    expect(published.at(-1)?.theme).toMatchObject({ isDirty: true, assetRevision: 2 });
  });

  it('passes a refusal on without changing anything', async () => {
    session.previewFailure = 'No theme is open.';

    const result = await controller.generatePreviews({ kinds: ['homePreview'] });

    expect(result).toEqual({ status: 'rejected', message: 'No theme is open.' });
    expect(published).toHaveLength(0);
  });

  it('says nothing about where any file is', async () => {
    const result = await controller.generatePreviews({ kinds: ['homePreview'] });

    expect(JSON.stringify(result)).not.toContain(CHOSEN_FOLDER);
    expect(JSON.stringify(result)).not.toContain('/');
  });
});

describe('the projects worked on before', () => {
  const RECENT = join(CHOSEN_FOLDER, 'Example Theme.vitatheme');

  it('remembers a project that was opened, named after itself rather than its path', async () => {
    await controller.openProject();

    expect(recents.entries()).toEqual([
      {
        id: 'aaaa0001',
        name: 'Example Theme',
        path: RECENT,
        openedAt: expect.any(Number) as number,
      },
    ]);
  });

  it('remembers a project that was saved', async () => {
    await controller.saveProjectAs();

    expect(recents.entries().map((project) => project.path)).toEqual([RECENT]);
  });

  it('remembers nothing when a save failed', async () => {
    session.saveFailure = 'The project could not be written.';

    await controller.saveProjectAs();

    expect(recents.entries()).toEqual([]);
  });

  it('tells the window a name and a folder, and never a path', async () => {
    await controller.openProject();

    const offered = controller.describeSession().recentProjects;
    expect(offered).toEqual([
      { id: 'aaaa0001', name: 'Example Theme', folder: basename(CHOSEN_FOLDER), available: true },
    ]);
    expect(JSON.stringify(offered)).not.toContain(CHOSEN_FOLDER);
  });

  it('offers a project that is no longer there, saying so rather than hiding it', async () => {
    recents.set([
      { id: 'aaaa0009', name: 'Gone', path: join(CHOSEN_FOLDER, 'Gone.vitatheme'), openedAt: 5 },
    ]);
    missingProjects.add(join(CHOSEN_FOLDER, 'Gone.vitatheme'));

    await controller.loadRecentProjects();

    expect(controller.describeSession().recentProjects).toEqual([
      { id: 'aaaa0009', name: 'Gone', folder: basename(CHOSEN_FOLDER), available: false },
    ]);
  });

  it('opens one the window named, through the same opening as any other project', async () => {
    recents.set([{ id: 'aaaa0009', name: 'Saved Theme', path: RECENT, openedAt: 5 }]);
    await controller.loadRecentProjects();

    const result = await controller.openRecentProject('aaaa0009');

    expect(result).toEqual({ status: 'loaded' });
    expect(session.openedProjects).toEqual([{ path: RECENT, label: 'Saved Theme' }]);
  });

  it('does nothing for an entry it never offered', async () => {
    expect(await controller.openRecentProject('aaaa9999')).toEqual({ status: 'cancelled' });
    expect(session.openedProjects).toEqual([]);
  });

  it('keeps a project on the list when opening it fails, and marks it unavailable', async () => {
    recents.set([{ id: 'aaaa0009', name: 'Gone', path: RECENT, openedAt: 5 }]);
    await controller.loadRecentProjects();
    session.openFailure = 'That project is no longer there.';
    missingProjects.add(RECENT);

    const result = await controller.openRecentProject('aaaa0009');

    expect(result).toEqual({ status: 'failed', message: 'That project is no longer there.' });
    expect(recents.entries()).toHaveLength(1);
    expect(controller.describeSession().recentProjects[0]?.available).toBe(false);
  });

  it('takes an entry off the list without touching the project', async () => {
    await controller.openProject();

    await controller.forgetRecentProject('aaaa0001');

    expect(recents.entries()).toEqual([]);
    expect(controller.describeSession().recentProjects).toEqual([]);
  });

  it('asks about unsaved work before opening one, and stops when told to', async () => {
    recents.set([{ id: 'aaaa0009', name: 'Saved Theme', path: RECENT, openedAt: 5 }]);
    await controller.loadRecentProjects();
    session.loaded = aLoadedTheme({ label: 'Midnight', isDirty: true });
    dialogs.answer = 'cancel';

    expect(await controller.openRecentProject('aaaa0009')).toEqual({ status: 'cancelled' });
    expect(dialogs.asked).toEqual(['Midnight']);
    expect(session.openedProjects).toEqual([]);
  });
});

describe('reopening the last project', () => {
  const LAST = join(CHOSEN_FOLDER, 'Last.vitatheme');

  it('opens whichever was worked on most recently', async () => {
    recents.set([
      { id: 'aaaa0001', name: 'Older', path: join(CHOSEN_FOLDER, 'Older.vitatheme'), openedAt: 1 },
      { id: 'aaaa0002', name: 'Last', path: LAST, openedAt: 99 },
    ]);
    await controller.loadRecentProjects();

    const result = await controller.reopenLastProject();

    expect(result).toEqual({ status: 'loaded' });
    expect(session.openedProjects).toEqual([{ path: LAST, label: 'Last' }]);
  });

  it('does nothing when no project has been worked on', async () => {
    expect(await controller.reopenLastProject()).toEqual({ status: 'cancelled' });
    expect(session.openedProjects).toEqual([]);
  });

  it('asks about unsaved work first, and saves when that is the answer', async () => {
    recents.set([{ id: 'aaaa0002', name: 'Last', path: LAST, openedAt: 99 }]);
    await controller.loadRecentProjects();
    session.loaded = aLoadedTheme({ label: 'Midnight', isDirty: true });
    session.location = join(CHOSEN_FOLDER, 'Midnight.vitatheme');
    dialogs.answer = 'save';

    const result = await controller.reopenLastProject();

    expect(session.saves).toEqual([
      { path: join(CHOSEN_FOLDER, 'Midnight.vitatheme'), label: 'Midnight' },
    ]);
    expect(result).toEqual({ status: 'loaded' });
  });

  it('reports a project that is no longer there, and keeps it on the list to be dealt with', async () => {
    recents.set([{ id: 'aaaa0002', name: 'Last', path: LAST, openedAt: 99 }]);
    await controller.loadRecentProjects();
    session.openFailure = 'That project is no longer there.';
    missingProjects.add(LAST);

    const result = await controller.reopenLastProject();

    expect(result).toEqual({ status: 'failed', message: 'That project is no longer there.' });
    expect(controller.describeSession().recentProjects[0]?.available).toBe(false);
  });
});

describe('a file dragged onto a slot', () => {
  const DROPPED = join(CHOSEN_FOLDER, 'artwork', 'dragged.png');
  const SLOT = { kind: 'liveAreaBackground', page: 0 } as const;

  it('goes into the slot the same way a chosen file does', async () => {
    const result = await controller.assignDroppedAsset(SLOT, DROPPED);

    expect(result).toEqual({ status: 'assigned' });
    expect(session.assignments).toEqual([{ slot: SLOT, location: DROPPED }]);
  });

  it('tells the window the theme changed', async () => {
    await controller.assignDroppedAsset(SLOT, DROPPED);

    expect(published).toHaveLength(1);
  });

  it('refuses a path that is not absolute, which no drop produces', async () => {
    const result = await controller.assignDroppedAsset(SLOT, 'artwork/relative.png');

    expect(result.status).toBe('rejected');
    expect(session.assignments).toEqual([]);
  });

  it('refuses when no theme is open', async () => {
    session.loaded = null;

    expect(await controller.assignDroppedAsset(SLOT, DROPPED)).toEqual({
      status: 'rejected',
      message: 'No theme is open.',
    });
  });

  it('passes on what the session said when the file cannot be used', async () => {
    session.assignFailure = 'That file is larger than a theme can hold.';

    const result = await controller.assignDroppedAsset(SLOT, DROPPED);

    expect(result).toEqual({
      status: 'rejected',
      message: 'That file is larger than a theme can hold.',
    });
  });
});
