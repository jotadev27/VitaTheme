import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS, BRIDGE_KEY } from '../ipc';
import type {
  AppCommand,
  AppDescription,
  ApplyEditRequest,
  AssetPreview,
  AssignAssetRequest,
  AssignAssetResult,
  ConvertAssetRequest,
  ConvertAssetResult,
  BulkImageConversionRequest,
  BulkImageConversionResult,
  RecentProjectRequest,
  EditResult,
  ExportRequest,
  ExportResult,
  GeneratePreviewsRequest,
  GeneratePreviewsResult,
  GeneratePageThumbnailRequest,
  GeneratePageThumbnailResult,
  IconSetImportResult,
  PreviewAssetRequest,
  ProjectSaveResult,
  SessionSnapshot,
  StartDraftRequest,
  ThemeLoadResult,
  VitaThemeBridge,
} from '../ipc';

/**
 * The bridge between the window and the process that has privileges.
 *
 * This file is the whole of what the interface can reach. It forwards named
 * operations and two subscriptions, and hands over nothing else: no `ipcRenderer`, no
 * module loader, no path. It runs sandboxed, so it has no more access to the machine than
 * the page it serves — it is a list of permitted requests, not a way around the boundary.
 *
 * Event objects are never passed on. An Electron event carries a reference to the sender,
 * which would hand the page a way to talk to any channel it liked.
 */

const subscribe = (channel: string, listener: (payload: unknown) => void): (() => void) => {
  const forward = (_event: unknown, payload: unknown): void => {
    listener(payload);
  };

  ipcRenderer.on(channel, forward);
  return () => {
    ipcRenderer.removeListener(channel, forward);
  };
};

const bridge: VitaThemeBridge = {
  describeApp: () => ipcRenderer.invoke(IPC_CHANNELS.describeApp) as Promise<AppDescription>,
  describeSession: () =>
    ipcRenderer.invoke(IPC_CHANNELS.describeSession) as Promise<SessionSnapshot>,

  startDraft: (request: StartDraftRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.startDraft, request) as Promise<ThemeLoadResult>,
  openThemeFolder: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openThemeFolder) as Promise<ThemeLoadResult>,
  openProject: () => ipcRenderer.invoke(IPC_CHANNELS.openProject) as Promise<ThemeLoadResult>,
  openRecentProject: (request: RecentProjectRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.openRecentProject, request) as Promise<ThemeLoadResult>,
  reopenLastProject: () =>
    ipcRenderer.invoke(IPC_CHANNELS.reopenLastProject) as Promise<ThemeLoadResult>,
  forgetRecentProject: (request: RecentProjectRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.forgetRecentProject, request) as Promise<void>,
  saveProject: () => ipcRenderer.invoke(IPC_CHANNELS.saveProject) as Promise<ProjectSaveResult>,
  saveProjectAs: () => ipcRenderer.invoke(IPC_CHANNELS.saveProjectAs) as Promise<ProjectSaveResult>,
  recoverProject: () => ipcRenderer.invoke(IPC_CHANNELS.recoverProject) as Promise<ThemeLoadResult>,
  discardRecovery: () => ipcRenderer.invoke(IPC_CHANNELS.discardRecovery) as Promise<void>,
  refreshTheme: () => ipcRenderer.invoke(IPC_CHANNELS.refreshTheme) as Promise<ThemeLoadResult>,
  closeTheme: () => ipcRenderer.invoke(IPC_CHANNELS.closeTheme) as Promise<void>,

  applyEdit: (request: ApplyEditRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.applyEdit, request) as Promise<EditResult>,
  undo: () => ipcRenderer.invoke(IPC_CHANNELS.undo) as Promise<void>,
  redo: () => ipcRenderer.invoke(IPC_CHANNELS.redo) as Promise<void>,
  assignAsset: (request: AssignAssetRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignAsset, request) as Promise<AssignAssetResult>,
  dropAsset: (slot, file) => {
    // The only way a location reaches this application without somebody choosing it in a
    // dialog, and it is still their choice: they dragged the file here. `getPathForFile`
    // answers only for a file the system handed to this window, so a page that builds a
    // `File` of its own — or passes something that is not one at all — gets nothing back and
    // asks for nothing.
    const path = file instanceof File ? webUtils.getPathForFile(file) : '';

    return path === ''
      ? Promise.resolve<AssignAssetResult>({ status: 'cancelled' })
      : (ipcRenderer.invoke(IPC_CHANNELS.assignDroppedAsset, {
          slot,
          path,
        }) as Promise<AssignAssetResult>);
  },
  previewAsset: (request: PreviewAssetRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.previewAsset, request) as Promise<AssetPreview | null>,
  convertAsset: (request: ConvertAssetRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.convertAsset, request) as Promise<ConvertAssetResult>,
  convertIncompatibleImages: (request: BulkImageConversionRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.convertIncompatibleImages,
      request,
    ) as Promise<BulkImageConversionResult>,
  importIconSet: () =>
    ipcRenderer.invoke(IPC_CHANNELS.importIconSet) as Promise<IconSetImportResult>,
  generatePreviews: (request: GeneratePreviewsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.generatePreviews, request) as Promise<GeneratePreviewsResult>,
  generatePageThumbnail: (request: GeneratePageThumbnailRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.generatePageThumbnail,
      request,
    ) as Promise<GeneratePageThumbnailResult>,

  runExport: (request: ExportRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.runExport, request) as Promise<ExportResult>,
  confirmExportReplacement: () =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmExportReplacement) as Promise<ExportResult>,
  revealLastExport: () => ipcRenderer.invoke(IPC_CHANNELS.revealLastExport) as Promise<boolean>,

  onSessionChanged: (listener: (snapshot: SessionSnapshot) => void) =>
    subscribe(IPC_CHANNELS.sessionChanged, (payload) => {
      listener(payload as SessionSnapshot);
    }),
  onAppCommand: (listener: (command: AppCommand) => void) =>
    subscribe(IPC_CHANNELS.appCommand, (payload) => {
      listener(payload as AppCommand);
    }),
};

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
