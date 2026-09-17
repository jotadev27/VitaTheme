import { basename, dirname, isAbsolute, join } from 'node:path';
import { shell } from 'electron';
import type { ExternalFileStore } from '../../application/ports/external-file';
import type { ProjectStore, RecoveryLocation } from '../../application/ports/project-store';
import type {
  RecentProject as StoredRecentProject,
  RecentProjectsStore,
} from '../../application/ports/recent-projects-store';
import {
  forgetRecentProject,
  lastRecentProject,
  orderRecentProjects,
  rememberRecentProject,
} from '../../application/session/recent-projects';
import type {
  ExportDestination,
  LoadedTheme,
  ThemeSession,
} from '../../application/session/theme-session';
import {
  projectDisplayName,
  projectFilePath,
  PROJECT_FILE_EXTENSION,
} from '../../infrastructure/project/project-paths';
import { importSystemIconSet } from '../../application/use-cases/import-system-icon-set';
import { assetSlotUsage, type ThemeAssetSlot } from '../../domain/editing/theme-asset-slot';
import type { ThemeEdit } from '../../domain/editing/theme-edit';
import type { ImageContainerFormat } from '../../domain/model/media';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import { themeFileName } from '../../domain/model/theme-name';
import { errorsIn } from '../../domain/validation/report';
import type {
  AssetPreview,
  AssignAssetResult,
  ConvertAssetRequest,
  ConvertAssetResult,
  BulkImageConversionRequest,
  BulkImageConversionResult,
  EditResult,
  ExportRecord,
  ExportRequest,
  ExportResult,
  GeneratePreviewsRequest,
  GeneratePreviewsResult,
  GeneratePageThumbnailRequest,
  GeneratePageThumbnailResult,
  IconSetImportResult,
  ProjectSaveResult,
  RecentProject,
  RecoveryOffer,
  SessionSnapshot,
  StartDraftRequest,
  ThemeLoadResult,
  ThemeSnapshot,
} from '../../ipc/contract';
import type { AppDialogs } from './dialogs';

/**
 * What the interface asks for, carried out with the privileges the interface does not have.
 *
 * Every operation here is one the person can name — open a theme, export it, replace what is
 * already there — rather than a capability they could combine into something else. Paths
 * enter through a dialog and stop here: what goes back to the window is a name and an
 * outcome.
 */

export interface AppController {
  describeSession(): SessionSnapshot;
  /** Whether closing now would lose work. Answered without asking anybody anything. */
  hasUnsavedChanges(): boolean;
  /**
   * Asks about unsaved work and carries out the answer, saving it if that is what was
   * chosen. True when whatever is waiting may now go ahead.
   */
  confirmDiscardChanges(): Promise<boolean>;
  /** Looks for work an interrupted session left behind, and offers it back if there is any. */
  detectRecovery(): Promise<void>;
  /** Reads the projects worked on before, and which of them are still there. */
  loadRecentProjects(): Promise<void>;
  applyEdit(edit: ThemeEdit): Promise<EditResult>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  assignAsset(slot: ThemeAssetSlot): Promise<AssignAssetResult>;
  /** Replaces system icons from a folder of them, as one change. */
  importIconSet(): Promise<IconSetImportResult>;
  convertAsset(request: ConvertAssetRequest): Promise<ConvertAssetResult>;
  convertIncompatibleImages(
    request: BulkImageConversionRequest,
  ): Promise<BulkImageConversionResult>;
  /** Draws the pictures the theme is browsed by, as one change. */
  generatePreviews(request: GeneratePreviewsRequest): Promise<GeneratePreviewsResult>;
  generatePageThumbnail(
    request: GeneratePageThumbnailRequest,
  ): Promise<GeneratePageThumbnailResult>;
  previewAsset(path: ThemeAssetPath): Promise<AssetPreview | null>;
  startDraft(request: StartDraftRequest): Promise<ThemeLoadResult>;
  openThemeFolder(): Promise<ThemeLoadResult>;
  openProject(): Promise<ThemeLoadResult>;
  /** Opens a project the window was offered. The window names the entry, never a location. */
  openRecentProject(id: string): Promise<ThemeLoadResult>;
  /** Opens the project that was worked on last. */
  reopenLastProject(): Promise<ThemeLoadResult>;
  /** Takes an entry off the list without touching the project it points at. */
  forgetRecentProject(id: string): Promise<void>;
  /** Puts a file that was dragged onto the window into a slot. */
  assignDroppedAsset(slot: ThemeAssetSlot, path: string): Promise<AssignAssetResult>;
  saveProject(): Promise<ProjectSaveResult>;
  saveProjectAs(): Promise<ProjectSaveResult>;
  recoverProject(): Promise<ThemeLoadResult>;
  discardRecovery(): Promise<void>;
  refreshTheme(): Promise<ThemeLoadResult>;
  closeTheme(): Promise<void>;
  runExport(request: ExportRequest): Promise<ExportResult>;
  confirmExportReplacement(): Promise<ExportResult>;
  revealLastExport(): boolean;
}

export interface AppControllerDependencies {
  readonly session: ThemeSession;
  readonly dialogs: AppDialogs;
  /**
   * Files from outside the theme. The same store the session uses, so a folder of icons is
   * read under exactly the rules a single chosen file is.
   */
  readonly externalFiles: ExternalFileStore;
  /** Tells the window the session changed. Called after everything that changes it. */
  readonly publish: (snapshot: SessionSnapshot) => void;
  /** Where the list of projects worked on before is kept. */
  readonly recentProjects: RecentProjectsStore;
  /** Asked whether a remembered project is still where it was. */
  readonly projects: Pick<ProjectStore, 'exists'>;
  /** The clock, so what "recent" means can be decided in a test. */
  readonly now?: () => number;
  /** Identifies an entry to the window. Supplied so it can be made predictable in a test. */
  readonly newRecentId?: () => string;
}

/**
 * How large an image may be before the window is simply not shown it.
 *
 * A preview is a convenience; a theme asset that runs to megabytes is a mistake the validator
 * will already be reporting. The ceiling keeps a single odd file from being turned into a
 * very large message.
 */
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

const IMAGE_MEDIA_TYPES: Readonly<Record<ImageContainerFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const snapshotOf = (theme: LoadedTheme): ThemeSnapshot => ({
  origin: theme.origin,
  label: theme.label,
  project: theme.project,
  report: theme.report,
  assets: theme.assets,
  canUndo: theme.canUndo,
  canRedo: theme.canRedo,
  revision: theme.revision,
  assetRevision: theme.assetRevision,
  isDirty: theme.isDirty,
});

/** Hexadecimal, and long enough that two entries never collide. */
const randomRecentId = (): string =>
  Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0'),
  ).join('');

export const createAppController = ({
  session,
  dialogs,
  externalFiles,
  publish,
  recentProjects,
  projects,
  now = () => Date.now(),
  newRecentId = randomRecentId,
}: AppControllerDependencies): AppController => {
  let lastExport: ExportRecord | null = null;
  /** Where the last export landed. Held here so the window never has to know a path. */
  let lastExportPath: string | null = null;
  /** An export that stopped because something was already there, waiting for consent. */
  let pendingReplacement: ExportDestination | null = null;
  /**
   * Work an interrupted session left behind. The offer is what the window is shown; the
   * location beside it is how this process finds the document, and never leaves here.
   */
  let recovery: { readonly offer: RecoveryOffer; readonly location: RecoveryLocation } | null =
    null;

  /**
   * The projects worked on before, with whether each was still there when last looked at.
   *
   * Held here rather than read on every publish: a list of shortcuts is not worth a handful
   * of filesystem calls every time somebody types a letter into a theme's name. It is
   * refreshed when it changes and when an attempt to open one of them fails.
   */
  let recents: readonly { readonly entry: StoredRecentProject; readonly available: boolean }[] = [];

  const describeRecents = (): readonly RecentProject[] =>
    recents.map(({ entry, available }) => ({
      id: entry.id,
      name: entry.name,
      // The folder's name, not where it is: enough to tell two projects apart, and nothing
      // about the machine beyond that.
      folder: basename(dirname(entry.path)),
      available,
    }));

  const describeSession = (): SessionSnapshot => {
    const theme = session.current();
    return {
      theme: theme === null ? null : snapshotOf(theme),
      lastExport,
      recovery: recovery?.offer ?? null,
      recentProjects: describeRecents(),
    };
  };

  const publishSession = (): void => {
    publish(describeSession());
  };

  const performExport = async (destination: ExportDestination): Promise<ExportResult> => {
    const outcome = await session.exportTo(destination);
    publishSession();

    if (outcome === null) {
      return { status: 'failed', message: 'No theme is open.' };
    }

    switch (outcome.status) {
      case 'exported': {
        const record: ExportRecord = {
          format: destination.kind,
          name: basename(destination.path),
          fileCount: outcome.summary.fileCount,
          totalBytes: outcome.summary.totalBytes,
        };
        lastExport = record;
        lastExportPath = destination.path;
        pendingReplacement = null;
        publishSession();
        return { status: 'exported', record };
      }

      case 'blocked':
        return { status: 'blocked', errorCount: errorsIn(outcome.report).length };

      case 'failed':
        if (outcome.failure.code === 'destination-exists') {
          pendingReplacement = destination;
          return {
            status: 'needs-confirmation',
            name: basename(destination.path),
            format: destination.kind,
          };
        }
        return { status: 'failed', message: outcome.failure.message };
    }
  };

  const exportName = (): string => {
    const theme = session.current();
    return themeFileName(theme?.project.metadata.title.defaultValue ?? '');
  };

  /** Where work in progress for whatever is open would be kept. */
  const recoveryLocation = (): RecoveryLocation => {
    const location = session.projectLocation();
    return location === null ? { kind: 'untitled' } : { kind: 'project', path: location };
  };

  const saveTo = async (path: string, label: string): Promise<ProjectSaveResult> => {
    const saved = await session.saveTo(path, label);
    if (!saved.ok) {
      // A save that failed changed nothing, including which projects are worth offering.
      publishSession();
      return { status: 'failed', message: saved.error.message };
    }

    await rememberProject(path, label);
    publishSession();
    return { status: 'saved', name: basename(path) };
  };

  const saveProjectAs = async (): Promise<ProjectSaveResult> => {
    if (session.current() === null) {
      return { status: 'failed', message: 'No theme is open.' };
    }

    const chosen = await dialogs.chooseProjectDestination(
      `${exportName()}${PROJECT_FILE_EXTENSION}`,
    );
    if (chosen === null) {
      return { status: 'cancelled' };
    }

    // The extension is not decoration: the files a project keeps are named from its stem, so
    // two projects saved under the same stem would share one folder of files.
    const path = projectFilePath(chosen);
    return saveTo(path, projectDisplayName(path));
  };

  const saveProject = async (): Promise<ProjectSaveResult> => {
    const theme = session.current();
    if (theme === null) {
      return { status: 'failed', message: 'No theme is open.' };
    }

    const location = session.projectLocation();
    // A theme that has never been saved has nowhere to be saved to, so saving asks where.
    return location === null ? saveProjectAs() : saveTo(location, theme.label);
  };

  /**
   * Asks about work that is not on disk, and does what the answer says.
   *
   * Every way of putting the open theme aside comes through here — closing it, closing the
   * window, opening something else — so there is one place that decides what happens to
   * unsaved work, and one wording for the question.
   */
  const confirmDiscardChanges = async (): Promise<boolean> => {
    const theme = session.current();
    if (theme?.isDirty !== true) {
      return true;
    }

    switch (await dialogs.confirmUnsavedChanges(theme.label)) {
      case 'cancel':
        return false;
      case 'save':
        // A save that failed, or that was called off at the dialog, leaves the work where it
        // is: whatever asked to go ahead does not.
        return (await saveProject()).status === 'saved';
      case 'discard':
        // The work is given up, and so is anything being kept in order to recover it.
        await session.discardRecovery(recoveryLocation());
        return true;
    }
  };

  /** Everything an open theme leaves behind, cleared before another one takes its place. */
  const forgetOpenTheme = (): void => {
    pendingReplacement = null;
    recovery = null;
  };

  /** Reads the list again and asks, once, which of its projects are still there. */
  const refreshRecents = async (): Promise<void> => {
    const entries = orderRecentProjects(await recentProjects.read());

    recents = await Promise.all(
      entries.map(async (entry) => ({ entry, available: await projects.exists(entry.path) })),
    );
  };

  /** Puts a project at the top of the list. Only ever called after one has actually opened or saved. */
  const rememberProject = async (path: string, name: string): Promise<void> => {
    const remembered = rememberRecentProject(
      await recentProjects.read(),
      { path, name },
      now(),
      newRecentId,
    );

    await recentProjects.write(remembered);
    await refreshRecents();
  };

  const forgetProject = async (id: string): Promise<void> => {
    await recentProjects.write(forgetRecentProject(await recentProjects.read(), id));
    await refreshRecents();
  };

  /**
   * Opens a project at a known location.
   *
   * Everything that opens a project comes through here — the dialog, the list of recent
   * projects, reopening the last one — so a project chosen from a list is checked exactly as
   * one chosen in a dialog, and is remembered on the same terms.
   */
  const openProjectAt = async (path: string, label: string): Promise<ThemeLoadResult> => {
    const opened = await session.openProject(path, label);
    forgetOpenTheme();

    if (opened.ok) {
      await rememberProject(path, label);
      await offerProjectRecovery(path);
    } else {
      // A project that could not be opened stays on the list, in the place it already had,
      // and is shown as unavailable: somebody may want to put it back where it was.
      await refreshRecents();
    }

    publishSession();
    return opened.ok ? { status: 'loaded' } : { status: 'failed', message: opened.error.message };
  };

  const offerProjectRecovery = async (path: string): Promise<void> => {
    if (await session.hasRecovery({ kind: 'project', path })) {
      recovery = {
        offer: { kind: 'project', label: projectDisplayName(path) },
        location: { kind: 'project', path },
      };
    }
  };

  return {
    describeSession,
    hasUnsavedChanges: () => session.current()?.isDirty === true,
    confirmDiscardChanges,

    loadRecentProjects: async () => {
      await refreshRecents();
      publishSession();
    },

    detectRecovery: async () => {
      // Only work that was never saved anywhere is looked for at startup. A project's own
      // work in progress is offered when that project is opened, which is the moment
      // somebody can tell what it belongs to.
      if (session.current() === null && (await session.hasRecovery({ kind: 'untitled' }))) {
        recovery = {
          offer: { kind: 'untitled', label: 'Unsaved theme' },
          location: { kind: 'untitled' },
        };
        publishSession();
      }
    },

    saveProject,
    saveProjectAs,

    openProject: async () => {
      if (!(await confirmDiscardChanges())) {
        return { status: 'cancelled' };
      }

      const chosen = await dialogs.chooseProjectFile();
      if (chosen === null) {
        return { status: 'cancelled' };
      }

      return openProjectAt(chosen, projectDisplayName(chosen));
    },

    openRecentProject: async (id) => {
      const remembered = recents.find(({ entry }) => entry.id === id);
      if (remembered === undefined) {
        return { status: 'cancelled' };
      }

      // Asked before anything is opened, and answered by the one place that decides what
      // happens to unsaved work.
      if (!(await confirmDiscardChanges())) {
        return { status: 'cancelled' };
      }

      return openProjectAt(remembered.entry.path, remembered.entry.name);
    },

    reopenLastProject: async () => {
      const last = lastRecentProject(recents.map(({ entry }) => entry));
      if (last === null) {
        return { status: 'cancelled' };
      }

      if (!(await confirmDiscardChanges())) {
        return { status: 'cancelled' };
      }

      return openProjectAt(last.path, last.name);
    },

    forgetRecentProject: async (id) => {
      await forgetProject(id);
      publishSession();
    },

    recoverProject: async () => {
      const pending = recovery;
      recovery = null;
      if (pending === null) {
        return { status: 'cancelled' };
      }

      const opened = await session.openRecovery(
        pending.location,
        pending.location.kind === 'project' ? pending.offer.label : null,
      );
      publishSession();

      return opened.ok ? { status: 'loaded' } : { status: 'failed', message: opened.error.message };
    },

    discardRecovery: async () => {
      const pending = recovery;
      recovery = null;
      if (pending !== null) {
        // The project itself is untouched: only the work that was not saved is given up.
        await session.discardRecovery(pending.location);
      }
      publishSession();
    },

    applyEdit: async (edit) => {
      const edited = await session.applyEdit(edit);
      if (!edited.ok) {
        return { status: 'rejected', message: edited.error.message };
      }

      publishSession();
      return { status: 'applied' };
    },

    undo: async () => {
      await session.undo();
      publishSession();
    },

    redo: async () => {
      await session.redo();
      publishSession();
    },

    assignAsset: async (slot) => {
      if (session.current() === null) {
        return { status: 'rejected', message: 'No theme is open.' };
      }

      const chosen = await dialogs.chooseAssetFile(
        assetSlotUsage(slot) === 'backgroundMusic' ? 'audio' : 'image',
      );
      if (chosen === null) {
        return { status: 'cancelled' };
      }

      const assigned = await session.assignAsset(slot, chosen);
      if (!assigned.ok) {
        return { status: 'rejected', message: assigned.error.message };
      }

      publishSession();
      return { status: 'assigned' };
    },

    importIconSet: async () => {
      if (session.current() === null) {
        return { status: 'rejected', message: 'No theme is open.' };
      }

      const folder = await dialogs.chooseIconSetFolder();
      if (folder === null) {
        return { status: 'cancelled' };
      }

      const outcome = await importSystemIconSet({
        session,
        files: externalFiles,
        folder,
        confirmReplacements: (replacements) => dialogs.confirmIconSetReplacements(replacements),
      });
      if (outcome.status === 'cancelled') {
        return { status: 'cancelled' };
      }
      if (outcome.status === 'failed') {
        return { status: 'rejected', message: outcome.message };
      }

      publishSession();
      return { status: 'imported', summary: outcome.summary };
    },

    assignDroppedAsset: async (slot, path) => {
      if (session.current() === null) {
        return { status: 'rejected', message: 'No theme is open.' };
      }

      // Absolute because the operating system's own drop data is: anything else was not
      // produced by a drop, and would be resolved against wherever this process was started.
      if (!isAbsolute(path)) {
        return { status: 'rejected', message: 'That file could not be read.' };
      }

      // From here it is the ordinary way a file enters a theme: examined, identified by its
      // bytes, named after the slot it went into, and staged.
      const assigned = await session.assignAsset(slot, path);
      if (!assigned.ok) {
        return { status: 'rejected', message: assigned.error.message };
      }

      publishSession();
      return { status: 'assigned' };
    },

    convertAsset: async ({ slot, fit }) => {
      const converted = await session.convertAsset(slot, fit);
      if (!converted.ok) {
        // The theme is untouched, so there is nothing to tell the window about but the reason.
        return { status: 'rejected', message: converted.error.message };
      }

      publishSession();
      return {
        status: 'converted',
        report: { source: converted.value.source, result: converted.value.result },
      };
    },

    convertIncompatibleImages: async ({ fit }) => {
      const outcome = await session.convertIncompatibleImages(fit);
      if (!outcome.ok) {
        return { status: 'rejected', message: outcome.error.message };
      }
      const count = outcome.value.converted.length + outcome.value.regeneratedThumbnails;
      if (count > 0) {
        publishSession();
      }
      return { status: 'converted', count };
    },

    generatePreviews: async ({ kinds }) => {
      const drawn = await session.generatePreviews(kinds);
      if (!drawn.ok) {
        // Nothing was drawn, so there is nothing to tell the window about but the reason.
        return { status: 'rejected', message: drawn.error.message };
      }

      publishSession();
      return {
        status: 'generated',
        summary: { generated: drawn.value.generated, refused: drawn.value.refused },
      };
    },

    generatePageThumbnail: async ({ page }) => {
      const result = await session.generatePageThumbnail(page);
      if (!result.ok) return { status: 'rejected', message: result.error.message };
      publishSession();
      return { status: 'generated' };
    },

    previewAsset: async (path) => {
      const summary = session.current()?.assets.find((asset) => asset.path === path);
      if (summary?.lookup.status !== 'found') {
        return null;
      }

      const { media, byteSize } = summary.lookup.asset;
      // Only images, and only what was already identified as one: the window is shown
      // pixels, and only for a file this process has already read and recognised.
      if (media.kind !== 'image' || byteSize > MAX_PREVIEW_BYTES) {
        return null;
      }

      const read = await session.readAsset(path);
      if (!read?.ok) {
        return null;
      }

      const encoded = Buffer.from(read.value).toString('base64');
      return { dataUrl: `data:${IMAGE_MEDIA_TYPES[media.format]};base64,${encoded}` };
    },

    startDraft: async (request) => {
      if (!(await confirmDiscardChanges())) {
        return { status: 'cancelled' };
      }

      session.startDraft(request);
      forgetOpenTheme();
      publishSession();
      return { status: 'loaded' };
    },

    openThemeFolder: async () => {
      if (!(await confirmDiscardChanges())) {
        return { status: 'cancelled' };
      }

      const folderPath = await dialogs.chooseThemeFolder();
      if (folderPath === null) {
        return { status: 'cancelled' };
      }

      const opened = await session.openFolder(folderPath, basename(folderPath));
      forgetOpenTheme();
      publishSession();

      return opened.ok ? { status: 'loaded' } : { status: 'failed', message: opened.error.message };
    },

    refreshTheme: async () => {
      const refreshed = await session.refresh();
      publishSession();

      return refreshed === null ? { status: 'cancelled' } : { status: 'loaded' };
    },

    closeTheme: async () => {
      if (!(await confirmDiscardChanges())) {
        return;
      }

      await session.close();
      forgetOpenTheme();
      lastExport = null;
      lastExportPath = null;
      publishSession();
    },

    runExport: async ({ format }) => {
      if (session.current() === null) {
        return { status: 'failed', message: 'No theme is open.' };
      }

      if (format === 'folder') {
        const parentFolder = await dialogs.chooseExportFolder();
        if (parentFolder === null) {
          return { status: 'cancelled' };
        }
        return performExport({
          kind: 'folder',
          path: join(parentFolder, exportName()),
          overwrite: false,
        });
      }

      const archivePath = await dialogs.chooseArchiveFile(`${exportName()}.zip`);
      if (archivePath === null) {
        return { status: 'cancelled' };
      }
      // The system's save panel already asked before letting an existing file be chosen.
      return performExport({ kind: 'archive', path: archivePath, overwrite: true });
    },

    confirmExportReplacement: async () => {
      const destination = pendingReplacement;
      if (destination === null) {
        return { status: 'cancelled' };
      }

      pendingReplacement = null;
      return performExport({ ...destination, overwrite: true });
    },

    revealLastExport: () => {
      if (lastExportPath === null) {
        return false;
      }

      shell.showItemInFolder(lastExportPath);
      return true;
    },
  };
};
