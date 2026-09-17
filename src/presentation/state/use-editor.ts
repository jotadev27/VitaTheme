import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { ImageFit } from '@/domain/editing/image-conversion';
import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type { ThemeEdit } from '@/domain/editing/theme-edit';
import type { ThemePreviewKind } from '@/domain/vita/theme-previews';
import type { AppCommand, ExportFormat, StartDraftRequest, VitaThemeBridge } from '@/ipc';
import type { PreviewSurfaceId } from '../preview/surfaces';
import type { SectionId } from './sections';
import {
  conversionResultAction,
  exportResultAction,
  iconSetImportResultAction,
  initialEditorState,
  previewGenerationResultAction,
  editorReducer,
  projectSaveResultAction,
  themeLoadResultAction,
  type PendingAction,
  type EditorDialog,
  type EditorState,
  type WorkspaceMode,
} from './editor-state';

/**
 * The interface's side of the application.
 *
 * Every command is one call to the bridge and one reduction of what came back. Nothing here
 * reads a file, resolves a path or decides whether a theme is valid; it asks, and shows the
 * answer. The menu goes through the same commands the buttons do, so the two can never come
 * to mean different things.
 */

export interface EditorActions {
  readonly selectSection: (section: SectionId) => void;
  readonly selectMode: (mode: WorkspaceMode) => void;
  readonly selectSurface: (surface: PreviewSurfaceId) => void;
  readonly selectPage: (page: number) => void;
  readonly highlightAsset: (path: string | null) => void;
  readonly openDialog: (dialog: EditorDialog) => void;
  readonly closeDialog: () => void;
  readonly dismissNotice: () => void;

  /** Asks for one named change to the theme. What comes back is the theme, not a copy. */
  readonly applyEdit: (edit: ThemeEdit) => Promise<void>;
  readonly undo: () => Promise<void>;
  readonly redo: () => Promise<void>;
  /** Asks for a file to be chosen and put in a slot. */
  readonly assignAsset: (slot: ThemeAssetSlot) => Promise<void>;
  /** Opens the question of converting what is in a slot; converting itself is below. */
  readonly beginConversion: (slot: ThemeAssetSlot, label: string) => void;
  /** Asks for what is in a slot to be made into a picture the theme can use. */
  readonly convertAsset: (slot: ThemeAssetSlot, fit: ImageFit) => Promise<void>;
  readonly convertIncompatibleImages: (fit: 'cover' | 'contain') => Promise<void>;
  readonly clearAsset: (slot: ThemeAssetSlot) => Promise<void>;
  /** Asks for the pictures the theme is browsed by to be drawn from its own artwork. */
  readonly generatePreviews: (kinds: readonly ThemePreviewKind[]) => Promise<void>;
  readonly generatePageThumbnail: (page: number) => Promise<void>;
  /** Asks what one of the theme's images looks like, as pixels rather than a location. */
  readonly previewAsset: (path: string) => Promise<string | null>;

  readonly startDraft: (request: StartDraftRequest) => Promise<void>;
  readonly openThemeFolder: () => Promise<void>;
  /** Opens a saved project, after asking about anything unsaved in the one that is open. */
  readonly openProject: () => Promise<void>;
  /** Opens one of the projects worked on before. The window names the entry, never a location. */
  readonly openRecentProject: (id: string) => Promise<void>;
  /** Opens whichever project was worked on last. */
  readonly reopenLastProject: () => Promise<void>;
  /** Takes an entry off the list. The project itself is left where it is. */
  readonly forgetRecentProject: (id: string) => Promise<void>;
  /** Puts a file dragged onto a slot into that slot. */
  readonly dropAsset: (slot: ThemeAssetSlot, file: File) => Promise<void>;
  /** Replaces system icons from a folder of them, as one change to take back. */
  readonly importIconSet: () => Promise<void>;
  /** Saves where the project already lives, asking where to put it the first time. */
  readonly saveProject: () => Promise<void>;
  readonly saveProjectAs: () => Promise<void>;
  /** Takes up work an interrupted session left behind, or gives it up. */
  readonly recoverProject: () => Promise<void>;
  readonly discardRecovery: () => Promise<void>;
  readonly refreshTheme: () => Promise<void>;
  readonly closeTheme: () => Promise<void>;
  readonly exportTheme: (format: ExportFormat) => Promise<void>;
  readonly confirmReplacement: () => Promise<void>;
  readonly revealLastExport: () => Promise<void>;
  /** Carries out a command from the application menu, through the same path as a button. */
  readonly run: (command: AppCommand) => void;
}

export interface Editor {
  readonly state: EditorState;
  readonly actions: EditorActions;
}

export const useEditor = (bridge: VitaThemeBridge): Editor => {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

  useEffect(() => {
    const describe = async (): Promise<void> => {
      const [app, session] = await Promise.all([bridge.describeApp(), bridge.describeSession()]);
      dispatch({ type: 'app-described', app });
      dispatch({ type: 'session-changed', session });
    };

    void describe();
    return bridge.onSessionChanged((session) => {
      dispatch({ type: 'session-changed', session });
    });
  }, [bridge]);

  const whilePending = useCallback(
    async (pending: Exclude<PendingAction, null>, work: () => Promise<void>): Promise<void> => {
      dispatch({ type: 'pending-changed', pending });
      try {
        await work();
      } finally {
        dispatch({ type: 'pending-changed', pending: null });
      }
    },
    [],
  );

  const actions = useMemo<EditorActions>(() => {
    const applyEdit = async (edit: ThemeEdit): Promise<void> => {
      const result = await bridge.applyEdit({ edit });
      dispatch(
        result.status === 'applied'
          ? { type: 'notice-dismissed' }
          : { type: 'notice-shown', notice: { tone: 'error', message: result.message } },
      );
    };

    const undo = (): Promise<void> => bridge.undo();
    const redo = (): Promise<void> => bridge.redo();

    const assignAsset = (slot: ThemeAssetSlot): Promise<void> =>
      whilePending('assigning', async () => {
        const result = await bridge.assignAsset({ slot });
        dispatch(
          result.status === 'rejected'
            ? { type: 'notice-shown', notice: { tone: 'error', message: result.message } }
            : { type: 'notice-dismissed' },
        );
      });

    const convertAsset = (slot: ThemeAssetSlot, fit: ImageFit): Promise<void> =>
      whilePending('converting', async () => {
        const result = await bridge.convertAsset({ slot, fit });
        if (result.status === 'converted') {
          dispatch({ type: 'dialog-closed' });
        }
        dispatch(conversionResultAction(result));
      });

    const convertIncompatibleImages = (fit: 'cover' | 'contain'): Promise<void> =>
      whilePending('converting', async () => {
        const result = await bridge.convertIncompatibleImages({ fit });
        if (result.status === 'converted') {
          dispatch({ type: 'dialog-closed' });
          dispatch({
            type: 'notice-shown',
            notice: {
              tone: 'success',
              message: `${String(result.count)} image${result.count === 1 ? '' : 's'} converted as one undoable change.`,
            },
          });
        } else {
          dispatch({ type: 'notice-shown', notice: { tone: 'error', message: result.message } });
        }
      });

    const generatePreviews = (kinds: readonly ThemePreviewKind[]): Promise<void> =>
      whilePending('drawing', async () => {
        dispatch(previewGenerationResultAction(await bridge.generatePreviews({ kinds })));
      });

    const generatePageThumbnail = (page: number): Promise<void> =>
      whilePending('drawing', async () => {
        const result = await bridge.generatePageThumbnail({ page });
        dispatch(
          result.status === 'generated'
            ? { type: 'notice-dismissed' }
            : { type: 'notice-shown', notice: { tone: 'error', message: result.message } },
        );
      });

    const startDraft = async (request: StartDraftRequest): Promise<void> => {
      dispatch({ type: 'dialog-closed' });
      dispatch(themeLoadResultAction(await bridge.startDraft(request)));
    };

    const openThemeFolder = (): Promise<void> =>
      whilePending('opening', async () => {
        dispatch(themeLoadResultAction(await bridge.openThemeFolder()));
      });

    const openProject = (): Promise<void> =>
      whilePending('opening', async () => {
        dispatch(themeLoadResultAction(await bridge.openProject()));
      });

    const openRecentProject = (id: string): Promise<void> =>
      whilePending('opening', async () => {
        dispatch(themeLoadResultAction(await bridge.openRecentProject({ id })));
      });

    const reopenLastProject = (): Promise<void> =>
      whilePending('opening', async () => {
        dispatch(themeLoadResultAction(await bridge.reopenLastProject()));
      });

    const forgetRecentProject = async (id: string): Promise<void> => {
      await bridge.forgetRecentProject({ id });
    };

    const dropAsset = (slot: ThemeAssetSlot, file: File): Promise<void> =>
      whilePending('assigning', async () => {
        const result = await bridge.dropAsset(slot, file);
        dispatch(
          result.status === 'rejected'
            ? { type: 'notice-shown', notice: { tone: 'error', message: result.message } }
            : { type: 'notice-dismissed' },
        );
      });

    const importIconSet = (): Promise<void> =>
      whilePending('assigning', async () => {
        dispatch(iconSetImportResultAction(await bridge.importIconSet()));
      });

    const saveProject = (): Promise<void> =>
      whilePending('saving', async () => {
        dispatch(projectSaveResultAction(await bridge.saveProject()));
      });

    const saveProjectAs = (): Promise<void> =>
      whilePending('saving', async () => {
        dispatch(projectSaveResultAction(await bridge.saveProjectAs()));
      });

    const recoverProject = (): Promise<void> =>
      whilePending('opening', async () => {
        dispatch(themeLoadResultAction(await bridge.recoverProject()));
      });

    const discardRecovery = async (): Promise<void> => {
      await bridge.discardRecovery();
    };

    const refreshTheme = (): Promise<void> =>
      whilePending('refreshing', async () => {
        dispatch(themeLoadResultAction(await bridge.refreshTheme()));
      });

    const closeTheme = async (): Promise<void> => {
      await bridge.closeTheme();
    };

    const exportTheme = (format: ExportFormat): Promise<void> =>
      whilePending('exporting', async () => {
        dispatch(exportResultAction(await bridge.runExport({ format })));
      });

    const confirmReplacement = (): Promise<void> =>
      whilePending('exporting', async () => {
        dispatch({ type: 'dialog-closed' });
        dispatch(exportResultAction(await bridge.confirmExportReplacement()));
      });

    const revealLastExport = async (): Promise<void> => {
      await bridge.revealLastExport();
    };

    const run = (command: AppCommand): void => {
      switch (command) {
        case 'new-theme':
          dispatch({ type: 'dialog-opened', dialog: { kind: 'new-theme' } });
          return;
        case 'open-theme':
          void openThemeFolder();
          return;
        case 'open-project':
          void openProject();
          return;
        case 'reopen-last-project':
          void reopenLastProject();
          return;
        case 'save-project':
          void saveProject();
          return;
        case 'save-project-as':
          void saveProjectAs();
          return;
        case 'refresh-theme':
          void refreshTheme();
          return;
        case 'close-theme':
          void closeTheme();
          return;
        case 'export-folder':
          void exportTheme('folder');
          return;
        case 'export-archive':
          void exportTheme('archive');
          return;
        case 'reveal-export':
          void revealLastExport();
          return;
        case 'toggle-preview':
          dispatch({ type: 'mode-toggled' });
          return;
        case 'undo':
          void undo();
          return;
        case 'redo':
          void redo();
          return;
      }
    };

    return {
      applyEdit,
      undo,
      redo,
      assignAsset,
      beginConversion: (slot, label) => {
        dispatch({ type: 'dialog-opened', dialog: { kind: 'convert-asset', slot, label } });
      },
      convertAsset,
      convertIncompatibleImages,
      clearAsset: (slot) => applyEdit({ kind: 'clear-asset', slot }),
      generatePreviews,
      generatePageThumbnail,
      previewAsset: async (path) => (await bridge.previewAsset({ path }))?.dataUrl ?? null,

      selectSection: (section) => {
        dispatch({ type: 'section-selected', section });
      },
      selectMode: (mode) => {
        dispatch({ type: 'mode-selected', mode });
      },
      selectSurface: (surface) => {
        dispatch({ type: 'surface-selected', surface });
      },
      selectPage: (page) => {
        dispatch({ type: 'page-selected', page });
      },
      highlightAsset: (path) => {
        dispatch({ type: 'asset-highlighted', path });
      },
      openDialog: (dialog) => {
        dispatch({ type: 'dialog-opened', dialog });
      },
      closeDialog: () => {
        dispatch({ type: 'dialog-closed' });
      },
      dismissNotice: () => {
        dispatch({ type: 'notice-dismissed' });
      },
      startDraft,
      openThemeFolder,
      openProject,
      openRecentProject,
      reopenLastProject,
      forgetRecentProject,
      dropAsset,
      importIconSet,
      saveProject,
      saveProjectAs,
      recoverProject,
      discardRecovery,
      refreshTheme,
      closeTheme,
      exportTheme,
      confirmReplacement,
      revealLastExport,
      run,
    };
  }, [bridge, whilePending]);

  useEffect(() => bridge.onAppCommand(actions.run), [bridge, actions]);

  return { state, actions };
};
