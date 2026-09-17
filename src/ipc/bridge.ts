import type { ThemeAssetSlot } from '../domain/editing/theme-asset-slot';
import type {
  AppDescription,
  GeneratePreviewsRequest,
  GeneratePreviewsResult,
  GeneratePageThumbnailRequest,
  GeneratePageThumbnailResult,
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
  PreviewAssetRequest,
  ExportResult,
  IconSetImportResult,
  ProjectSaveResult,
  SessionSnapshot,
  StartDraftRequest,
  AppCommand,
  ThemeLoadResult,
} from './contract';

/**
 * Everything the window is allowed to ask for.
 *
 * This is the whole surface: named operations and two subscriptions, each one a thing the
 * application does rather than a capability of the machine. There is no method here that
 * takes a path, reads a file or runs a command, because a window that can be made to ask
 * for one is a window that can be made to hand over the filesystem.
 */
export interface VitaThemeBridge {
  describeApp(): Promise<AppDescription>;
  describeSession(): Promise<SessionSnapshot>;

  startDraft(request: StartDraftRequest): Promise<ThemeLoadResult>;
  /** Asks the privileged side to choose a folder and open the theme in it. */
  openThemeFolder(): Promise<ThemeLoadResult>;
  /** Asks for a `.vitatheme` project to be chosen and opened. */
  openProject(): Promise<ThemeLoadResult>;
  /** Opens one of the projects the window was offered. It names the entry, never a location. */
  openRecentProject(request: RecentProjectRequest): Promise<ThemeLoadResult>;
  /** Opens the project that was worked on last, if there still is one. */
  reopenLastProject(): Promise<ThemeLoadResult>;
  /** Takes an entry off the list. The project itself is left alone. */
  forgetRecentProject(request: RecentProjectRequest): Promise<void>;
  refreshTheme(): Promise<ThemeLoadResult>;
  closeTheme(): Promise<void>;

  /** Saves the project where it already lives, asking where to put it the first time. */
  saveProject(): Promise<ProjectSaveResult>;
  /** Always asks where to save, and saves there from then on. */
  saveProjectAs(): Promise<ProjectSaveResult>;
  /** Takes up the work an interrupted session left behind. */
  recoverProject(): Promise<ThemeLoadResult>;
  /** Gives up that work. The project it belonged to is left exactly as it was. */
  discardRecovery(): Promise<void>;

  /** Makes one named change to the theme. The theme itself stays on the other side. */
  applyEdit(request: ApplyEditRequest): Promise<EditResult>;
  /** Takes back the last change, and puts it back. Both answer with a fresh snapshot. */
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Asks for a file to be chosen and put in a slot. The window names the slot, not the file. */
  assignAsset(request: AssignAssetRequest): Promise<AssignAssetResult>;
  /**
   * Puts a file that was dragged onto the application into a slot.
   *
   * Takes the `File` the drop handed the window, not a path: only the bridge can turn one
   * into the other, and only for a file the system actually gave to the window. A page that
   * makes up a `File` of its own gets nothing.
   */
  dropAsset(slot: ThemeAssetSlot, file: File): Promise<AssignAssetResult>;
  /** Asks what one of the theme's images looks like. */
  previewAsset(request: PreviewAssetRequest): Promise<AssetPreview | null>;
  /** Asks for what is in a slot to be made into a picture the theme can use. */
  convertAsset(request: ConvertAssetRequest): Promise<ConvertAssetResult>;
  convertIncompatibleImages(
    request: BulkImageConversionRequest,
  ): Promise<BulkImageConversionResult>;
  /**
   * Draws the pictures the theme is browsed by, from the theme's own artwork.
   *
   * Names the previews it wants and nothing else. Drawing is one change to take back, and a
   * preview somebody supplied is only ever redrawn because they pointed at that slot.
   */
  generatePreviews(request: GeneratePreviewsRequest): Promise<GeneratePreviewsResult>;
  generatePageThumbnail(
    request: GeneratePageThumbnailRequest,
  ): Promise<GeneratePageThumbnailResult>;
  /**
   * Replaces system icons from a folder of them.
   *
   * Takes nothing: the privileged side opens the folder dialog, reads what is in it and
   * decides what each file was for. The window is told what happened, by name.
   */
  importIconSet(): Promise<IconSetImportResult>;

  runExport(request: ExportRequest): Promise<ExportResult>;
  /** Repeats the export that reported `needs-confirmation`, replacing what is there. */
  confirmExportReplacement(): Promise<ExportResult>;
  /** Shows the last exported theme in the system file manager. */
  revealLastExport(): Promise<boolean>;

  onSessionChanged(listener: (snapshot: SessionSnapshot) => void): () => void;
  onAppCommand(listener: (command: AppCommand) => void): () => void;
}

/** The name the bridge is published under on `window`. */
export const BRIDGE_KEY = 'vitaTheme';
