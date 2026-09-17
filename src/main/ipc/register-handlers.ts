import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type {
  AppDescription,
  AssetPreview,
  AssignAssetResult,
  ConvertAssetResult,
  BulkImageConversionResult,
  EditResult,
  ExportResult,
  GeneratePreviewsResult,
  GeneratePageThumbnailResult,
  IconSetImportResult,
  ProjectSaveResult,
  SessionSnapshot,
  ThemeLoadResult,
} from '../../ipc/contract';
import { IPC_CHANNELS } from '../../ipc/contract';
import type { AppController } from '../app/app-controller';
import { isTrustedSender } from '../window';
import {
  parseConvertAssetRequest,
  parseBulkImageConversionRequest,
  parseDroppedAssetRequest,
  parseGeneratePreviewsRequest,
  parseGeneratePageThumbnailRequest,
  parseRecentProjectRequest,
  parseExportRequest,
  parseStartDraftRequest,
  parseThemeAssetPathRequest,
  parseThemeAssetSlot,
  parseThemeEdit,
} from './requests';

/**
 * The only way in.
 *
 * Each channel is one operation the application performs, registered once and answered only
 * for the application's own window. There is no channel that takes a path, reads a file or
 * evaluates anything: the surface is exactly as wide as the interface needs and no wider.
 */

const PLATFORMS = ['darwin', 'win32', 'linux'] as const;

const describePlatform = (): AppDescription['platform'] => {
  const platform = process.platform;
  return PLATFORMS.find((known) => known === platform) ?? 'other';
};

const describeApp = (): AppDescription => ({
  name: app.getName(),
  version: app.getVersion(),
  electronVersion: process.versions.electron,
  platform: describePlatform(),
});

/**
 * A message from anywhere but the application's own window is refused rather than answered.
 * Navigation is already blocked, so this should be unreachable; it is the check that stays
 * true if that ever stops being the case.
 */
const fromApplicationWindow = (event: IpcMainInvokeEvent): boolean => isTrustedSender(event.sender);

/** Every payload arrives as an unknown value; nothing is read off it before it is checked. */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const registerIpcHandlers = (controller: AppController): void => {
  const handle = <TResult>(
    channel: string,
    respond: (payload: unknown) => TResult | Promise<TResult>,
    refused: TResult,
  ): void => {
    ipcMain.handle(channel, (event, payload: unknown) =>
      fromApplicationWindow(event) ? respond(payload) : refused,
    );
  };

  const refusedLoad: ThemeLoadResult = {
    status: 'failed',
    message: 'The request did not come from the application window.',
  };
  const refusedExport: ExportResult = { status: 'cancelled' };
  const refusedEdit: EditResult = {
    status: 'rejected',
    message: 'The request did not come from the application window.',
  };
  const refusedSave: ProjectSaveResult = { status: 'cancelled' };
  const emptySession: SessionSnapshot = {
    theme: null,
    lastExport: null,
    recovery: null,
    recentProjects: [],
  };

  handle<AppDescription>(IPC_CHANNELS.describeApp, describeApp, describeApp());
  handle<SessionSnapshot>(
    IPC_CHANNELS.describeSession,
    () => controller.describeSession(),
    emptySession,
  );

  handle<ThemeLoadResult>(
    IPC_CHANNELS.startDraft,
    (payload) => {
      const request = parseStartDraftRequest(payload);
      return request.ok
        ? controller.startDraft(request.value)
        : ({ status: 'failed', message: request.error } satisfies ThemeLoadResult);
    },
    refusedLoad,
  );

  handle<ThemeLoadResult>(
    IPC_CHANNELS.openThemeFolder,
    () => controller.openThemeFolder(),
    refusedLoad,
  );
  handle<ThemeLoadResult>(IPC_CHANNELS.openProject, () => controller.openProject(), refusedLoad);
  handle<ThemeLoadResult>(
    IPC_CHANNELS.openRecentProject,
    (payload) => {
      const request = parseRecentProjectRequest(payload);
      return request.ok
        ? controller.openRecentProject(request.value.id)
        : ({ status: 'failed', message: request.error } satisfies ThemeLoadResult);
    },
    refusedLoad,
  );
  handle<ThemeLoadResult>(
    IPC_CHANNELS.reopenLastProject,
    () => controller.reopenLastProject(),
    refusedLoad,
  );
  handle<undefined>(
    IPC_CHANNELS.forgetRecentProject,
    async (payload) => {
      const request = parseRecentProjectRequest(payload);
      if (request.ok) {
        await controller.forgetRecentProject(request.value.id);
      }
      return undefined;
    },
    undefined,
  );
  handle<ProjectSaveResult>(IPC_CHANNELS.saveProject, () => controller.saveProject(), refusedSave);
  handle<ProjectSaveResult>(
    IPC_CHANNELS.saveProjectAs,
    () => controller.saveProjectAs(),
    refusedSave,
  );
  handle<ThemeLoadResult>(
    IPC_CHANNELS.recoverProject,
    () => controller.recoverProject(),
    refusedLoad,
  );
  handle<undefined>(
    IPC_CHANNELS.discardRecovery,
    async () => {
      await controller.discardRecovery();
      return undefined;
    },
    undefined,
  );
  handle<ThemeLoadResult>(IPC_CHANNELS.refreshTheme, () => controller.refreshTheme(), refusedLoad);
  handle<undefined>(
    IPC_CHANNELS.closeTheme,
    async () => {
      await controller.closeTheme();
      return undefined;
    },
    undefined,
  );

  handle<EditResult>(
    IPC_CHANNELS.applyEdit,
    (payload) => {
      const edit = parseThemeEdit(asRecord(payload)?.edit);
      return edit.ok
        ? controller.applyEdit(edit.value)
        : ({ status: 'rejected', message: edit.error } satisfies EditResult);
    },
    refusedEdit,
  );

  handle<undefined>(
    IPC_CHANNELS.undo,
    async () => {
      await controller.undo();
      return undefined;
    },
    undefined,
  );

  handle<undefined>(
    IPC_CHANNELS.redo,
    async () => {
      await controller.redo();
      return undefined;
    },
    undefined,
  );

  handle<AssignAssetResult>(
    IPC_CHANNELS.assignDroppedAsset,
    (payload) => {
      const request = parseDroppedAssetRequest(payload);
      return request.ok
        ? controller.assignDroppedAsset(request.value.slot, request.value.path)
        : ({ status: 'rejected', message: request.error } satisfies AssignAssetResult);
    },
    { status: 'cancelled' },
  );

  handle<AssignAssetResult>(
    IPC_CHANNELS.assignAsset,
    (payload) => {
      const slot = parseThemeAssetSlot(asRecord(payload)?.slot);
      return slot.ok
        ? controller.assignAsset(slot.value)
        : ({ status: 'rejected', message: slot.error } satisfies AssignAssetResult);
    },
    { status: 'cancelled' },
  );

  handle<ConvertAssetResult>(
    IPC_CHANNELS.convertAsset,
    (payload) => {
      const request = parseConvertAssetRequest(payload);
      return request.ok
        ? controller.convertAsset(request.value)
        : ({ status: 'rejected', message: request.error } satisfies ConvertAssetResult);
    },
    { status: 'rejected', message: 'The request did not come from the application window.' },
  );

  handle<BulkImageConversionResult>(
    IPC_CHANNELS.convertIncompatibleImages,
    (payload) => {
      const request = parseBulkImageConversionRequest(payload);
      return request.ok
        ? controller.convertIncompatibleImages(request.value)
        : ({ status: 'rejected', message: request.error } satisfies BulkImageConversionResult);
    },
    { status: 'rejected', message: 'The request did not come from the application window.' },
  );

  handle<GeneratePreviewsResult>(
    IPC_CHANNELS.generatePreviews,
    (payload) => {
      const request = parseGeneratePreviewsRequest(payload);
      return request.ok
        ? controller.generatePreviews(request.value)
        : ({ status: 'rejected', message: request.error } satisfies GeneratePreviewsResult);
    },
    { status: 'rejected', message: 'The request did not come from the application window.' },
  );

  handle<GeneratePageThumbnailResult>(
    IPC_CHANNELS.generatePageThumbnail,
    (payload) => {
      const request = parseGeneratePageThumbnailRequest(payload);
      return request.ok
        ? controller.generatePageThumbnail(request.value)
        : ({ status: 'rejected', message: request.error } satisfies GeneratePageThumbnailResult);
    },
    { status: 'rejected', message: 'The request did not come from the application window.' },
  );

  // Takes no payload: the folder is chosen here, in a dialog, and never named by the window.
  handle<IconSetImportResult>(IPC_CHANNELS.importIconSet, () => controller.importIconSet(), {
    status: 'cancelled',
  });

  handle<AssetPreview | null>(
    IPC_CHANNELS.previewAsset,
    (payload) => {
      const path = parseThemeAssetPathRequest(payload);
      return path.ok ? controller.previewAsset(path.value) : null;
    },
    null,
  );

  handle<ExportResult>(
    IPC_CHANNELS.runExport,
    (payload) => {
      const request = parseExportRequest(payload);
      return request.ok
        ? controller.runExport(request.value)
        : ({ status: 'failed', message: request.error } satisfies ExportResult);
    },
    refusedExport,
  );

  handle<ExportResult>(
    IPC_CHANNELS.confirmExportReplacement,
    () => controller.confirmExportReplacement(),
    refusedExport,
  );
  handle<boolean>(IPC_CHANNELS.revealLastExport, () => controller.revealLastExport(), false);
};
