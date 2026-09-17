import type { ImageFit } from '../domain/editing/image-conversion';
import type { ThemeAssetSlot } from '../domain/editing/theme-asset-slot';
import type { ThemeEdit } from '../domain/editing/theme-edit';
import type { InspectedAsset } from '../domain/model/media';
import type { ThemeProject } from '../domain/model/theme-project';
import type { ThemeAssetSummary } from '../domain/validation/asset-inventory';
import type { ValidationReport } from '../domain/validation/report';
import type { HomeAppSlotId } from '../domain/vita/home-app-slots';
import type { ThemePreviewKind } from '../domain/vita/theme-previews';

/**
 * What the window and the process behind it say to each other.
 *
 * Declarations only: channel names and the shape of what travels over them. Every type here
 * has to survive being copied between processes, and none of it is a path — the window is
 * never told where anything is on the machine, and never gets to say. The privileged side
 * chooses every location through a native dialog, and the window sees a name it can show.
 *
 * The theme itself is described with the domain's own types rather than a parallel set, so
 * there is one definition of what a theme is, and the interface cannot drift away from the
 * rules it is presenting.
 */

export const IPC_CHANNELS = {
  describeApp: 'vitatheme:app:describe',
  describeSession: 'vitatheme:session:describe',
  startDraft: 'vitatheme:theme:start-draft',
  openThemeFolder: 'vitatheme:theme:open-folder',
  openProject: 'vitatheme:project:open',
  openRecentProject: 'vitatheme:project:open-recent',
  forgetRecentProject: 'vitatheme:project:forget-recent',
  reopenLastProject: 'vitatheme:project:reopen-last',
  saveProject: 'vitatheme:project:save',
  saveProjectAs: 'vitatheme:project:save-as',
  recoverProject: 'vitatheme:project:recover',
  discardRecovery: 'vitatheme:project:discard-recovery',
  refreshTheme: 'vitatheme:theme:refresh',
  closeTheme: 'vitatheme:theme:close',
  applyEdit: 'vitatheme:theme:apply-edit',
  undo: 'vitatheme:theme:undo',
  redo: 'vitatheme:theme:redo',
  assignAsset: 'vitatheme:theme:assign-asset',
  assignDroppedAsset: 'vitatheme:theme:assign-dropped-asset',
  convertAsset: 'vitatheme:theme:convert-asset',
  convertIncompatibleImages: 'vitatheme:theme:convert-incompatible-images',
  generatePreviews: 'vitatheme:theme:generate-previews',
  generatePageThumbnail: 'vitatheme:theme:generate-page-thumbnail',
  importIconSet: 'vitatheme:theme:import-icon-set',
  previewAsset: 'vitatheme:asset:preview',
  runExport: 'vitatheme:export:run',
  confirmExportReplacement: 'vitatheme:export:confirm-replacement',
  revealLastExport: 'vitatheme:export:reveal-last',

  /** Pushed to the window: the session changed, here is all of it. */
  sessionChanged: 'vitatheme:session:changed',
  /** Pushed to the window: the application menu asked for something. */
  appCommand: 'vitatheme:app:command',
} as const;

/**
 * Where the theme came from. `project` is the one with somewhere to be saved back to, which
 * is what tells the interface whether saving will ask a question.
 */
export type ThemeOriginKind = 'folder' | 'draft' | 'project';
export type ExportFormat = 'folder' | 'archive';

export interface ThemeSnapshot {
  readonly origin: ThemeOriginKind;
  /** What to call the theme in the interface: a folder's name or a draft's title. */
  readonly label: string;
  readonly project: ThemeProject;
  readonly report: ValidationReport;
  readonly assets: readonly ThemeAssetSummary[];
  /** Whether there is a change to take back, and one to put back after taking it back. */
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Increases with every change to the theme, of any kind. */
  readonly revision: number;
  /**
   * Increases only when the theme's files can have changed.
   *
   * A file keeps its name when it is replaced, so the window has no other way to tell one
   * version of a picture from another. Keeping this apart from `revision` is what stops
   * renaming a theme from throwing away every image the window has already been shown.
   */
  readonly assetRevision: number;
  /** Whether there is work that has not been saved to a project. */
  readonly isDirty: boolean;
}

/**
 * Work an interrupted session left behind, waiting for a decision.
 *
 * The label is what to call it, never where it is: the window is offered a choice, not a
 * location, and the privileged side already knows which document the choice is about.
 */
export interface RecoveryOffer {
  readonly kind: 'untitled' | 'project';
  readonly label: string;
}

export interface ExportRecord {
  readonly format: ExportFormat;
  /** The name the theme was written under, without the folder that holds it. */
  readonly name: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

/**
 * A project somebody worked on before, as the window is allowed to know it.
 *
 * An id rather than a path: the window asks for "that one", and the privileged side is the
 * only thing that knows where "that one" is. The folder is named, not located — enough to
 * tell two projects with the same name apart, without putting somebody's home directory on
 * screen.
 */
export interface RecentProject {
  readonly id: string;
  readonly name: string;
  /** The name of the folder holding it. Never a path. */
  readonly folder: string;
  /** False when the project was not there the last time the application looked. */
  readonly available: boolean;
}

export interface SessionSnapshot {
  readonly theme: ThemeSnapshot | null;
  readonly lastExport: ExportRecord | null;
  /** Set when an interrupted session left work that has not been saved. */
  readonly recovery: RecoveryOffer | null;
  /** Projects to offer on the way in, most recently worked on first. */
  readonly recentProjects: readonly RecentProject[];
}

export interface StartDraftRequest {
  readonly title: string;
  readonly provider: string;
}

export interface ExportRequest {
  readonly format: ExportFormat;
}

export interface ApplyEditRequest {
  readonly edit: ThemeEdit;
}

export interface AssignAssetRequest {
  readonly slot: ThemeAssetSlot;
}

export interface RecentProjectRequest {
  readonly id: string;
}

/**
 * A file dragged onto a slot.
 *
 * This is the one message that carries a location, and it is worth saying why. Only the
 * window receives a drop — the privileged side cannot open a dialog on somebody's behalf
 * after the fact — so the path has to travel. It is produced by the preload from the
 * operating system's own drop data, never by the page: a page cannot manufacture one, because
 * the only way to obtain it is to be handed a real file by the system. The privileged side
 * then treats it exactly as it treats a path that came back from a dialog — resolved,
 * confined, identified by its bytes — because that is the same code.
 */
export interface DroppedAssetRequest {
  readonly slot: ThemeAssetSlot;
  readonly path: string;
}

export interface ConvertAssetRequest {
  readonly slot: ThemeAssetSlot;
  /** How a picture of another shape is made to fit. The window chooses; nothing else does. */
  readonly fit: ImageFit;
}

/** Only a fit choice crosses the boundary; the privileged session finds the images itself. */
export interface BulkImageConversionRequest {
  readonly fit: 'cover' | 'contain';
}

export type BulkImageConversionResult =
  | { readonly status: 'converted'; readonly count: number }
  | { readonly status: 'rejected'; readonly message: string };

/**
 * What a conversion did: what was in the slot, and what is in it now.
 *
 * Both are the same description the interface already shows for any file in the theme, so
 * there is nothing new to explain and no implementation detail to leak.
 */
export interface AssetConversionReport {
  readonly source: InspectedAsset;
  readonly result: InspectedAsset;
}

/**
 * Which of the three previews to draw.
 *
 * Names, not pictures and not places: the window says which slots it means, and everything
 * about what is drawn — the artwork, the sizes, where it is kept — stays on the other side.
 */
export interface GeneratePreviewsRequest {
  readonly kinds: readonly ThemePreviewKind[];
}

export interface GeneratePageThumbnailRequest {
  readonly page: number;
}

export type GeneratePageThumbnailResult =
  { readonly status: 'generated' } | { readonly status: 'rejected'; readonly message: string };

export interface PreviewAssetRequest {
  /** A path inside the theme. The window can only ever name a file the theme already has. */
  readonly path: string;
}

export type EditResult =
  | { readonly status: 'applied' }
  /** The change could not be made. The theme is exactly as it was. */
  | { readonly status: 'rejected'; readonly message: string };

export type AssignAssetResult =
  | { readonly status: 'assigned' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'rejected'; readonly message: string };

/**
 * What came of importing a folder of system icons.
 *
 * Names only — the folder the person chose, and where it was, stay on the privileged side.
 * Each list answers a question somebody will ask: what went in, what was left alone, what
 * could not be told apart, and what was meant for a slot but unusable.
 */
export interface IconSetImportSummary {
  readonly applied: readonly { readonly slot: HomeAppSlotId; readonly name: string }[];
  readonly ignored: readonly string[];
  readonly ambiguous: readonly string[];
  readonly rejected: readonly { readonly name: string; readonly reason: string }[];
}

export type IconSetImportResult =
  | { readonly status: 'imported'; readonly summary: IconSetImportSummary }
  | { readonly status: 'cancelled' }
  | { readonly status: 'rejected'; readonly message: string };

/**
 * What came of drawing previews: what was drawn, and why anything else was not.
 *
 * A preview that cannot be drawn is not an error — a theme with no lock screen wallpaper
 * has no lock screen to show — so both lists come back together and the interface says so.
 */
export interface PreviewGenerationSummary {
  readonly generated: readonly {
    readonly kind: ThemePreviewKind;
    readonly result: InspectedAsset;
  }[];
  readonly refused: readonly { readonly kind: ThemePreviewKind; readonly message: string }[];
}

export type GeneratePreviewsResult =
  | { readonly status: 'generated'; readonly summary: PreviewGenerationSummary }
  /** Nothing was drawn and the theme is unchanged. */
  | { readonly status: 'rejected'; readonly message: string };

export type ConvertAssetResult =
  | { readonly status: 'converted'; readonly report: AssetConversionReport }
  /** The picture is unchanged, and so is the theme. */
  | { readonly status: 'rejected'; readonly message: string };

/**
 * An image, as pixels rather than as a location.
 *
 * The window is shown what a file looks like without being told where it is or being able to
 * ask for anything else. The data URL is built in the privileged process from bytes that
 * were already read and identified there.
 */
export interface AssetPreview {
  readonly dataUrl: string;
}

export type ThemeLoadResult =
  | { readonly status: 'loaded' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly message: string };

export type ProjectSaveResult =
  | { readonly status: 'saved'; readonly name: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly message: string };

export type ExportResult =
  | { readonly status: 'exported'; readonly record: ExportRecord }
  | { readonly status: 'cancelled' }
  /** The theme breaks a confirmed rule. The issues are already in the session snapshot. */
  | { readonly status: 'blocked'; readonly errorCount: number }
  /** Something is already at the destination; exporting again with consent will replace it. */
  | { readonly status: 'needs-confirmation'; readonly name: string; readonly format: ExportFormat }
  | { readonly status: 'failed'; readonly message: string };

export type AppCommand =
  | 'new-theme'
  | 'open-theme'
  | 'open-project'
  | 'reopen-last-project'
  | 'save-project'
  | 'save-project-as'
  | 'close-theme'
  | 'refresh-theme'
  | 'export-folder'
  | 'export-archive'
  | 'reveal-export'
  | 'toggle-preview'
  | 'undo'
  | 'redo';

export interface AppDescription {
  readonly name: string;
  readonly version: string;
  readonly electronVersion: string;
  readonly platform: 'darwin' | 'win32' | 'linux' | 'other';
}
