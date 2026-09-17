import {
  applyThemeEdit,
  type ThemeEdit,
  type ThemeEditError,
} from '../../domain/editing/theme-edit';
import {
  assetAtSlot,
  assetSlotFileName,
  assetSlotUsage,
  withAssetAtSlot,
  type ThemeAssetSlot,
} from '../../domain/editing/theme-asset-slot';
import {
  imageConversionTarget,
  imageConversionWouldChange,
  type ImageFit,
} from '../../domain/editing/image-conversion';
import { incompatibleImageSlots } from '../../domain/editing/bulk-image-conversion';
import {
  pageThumbnailSource,
  withGeneratedPageThumbnail,
} from '../../domain/editing/page-thumbnail-provenance';
import { previewAssetSlot, withGeneratedPreview } from '../../domain/editing/preview-provenance';
import type { InspectedAsset } from '../../domain/model/media';
import type { ConvertedImage, ImageConversionError } from '../ports/image-converter';
import type { ThemeAssetPath } from '../../domain/model/theme-asset-path';
import {
  distinctAssetPaths,
  newThemeProject,
  type ThemeProject,
} from '../../domain/model/theme-project';
import { assetCatalogOf, type AssetLookup } from '../../domain/validation/asset-catalog';
import {
  summarizeThemeAssets,
  type ThemeAssetSummary,
} from '../../domain/validation/asset-inventory';
import type { ValidationReport } from '../../domain/validation/report';
import { validateThemeProject } from '../../domain/validation/validate-theme-project';
import { failure, success, type Result } from '../../domain/shared/result';
import type { ExternalFileError, ExternalFileStore } from '../ports/external-file';
import type { ImageConversionErrorCode, ImageConverter } from '../ports/image-converter';
import type { ProjectDocumentCodec, ProjectDocumentError } from '../ports/project-document-codec';
import type {
  ProjectStore,
  ProjectStoreError,
  RecoveryLocation,
  StoredProject,
} from '../ports/project-store';
import type { ThemeAssetReadError, ThemeAssetSource } from '../ports/theme-assets';
import type { ThemeExportFailure, ThemeExportTarget } from '../ports/theme-export-target';
import type { ThemeFolder, ThemeFolderError } from '../ports/theme-folder';
import type { ManifestParseError, ThemeManifestCodec } from '../ports/theme-manifest-codec';
import type { ThemePreviewKind } from '../../domain/vita/theme-previews';
import {
  coalescingKeyOf,
  historyAfterChange,
  historyAfterRedo,
  historyAfterUndo,
  NO_HISTORY,
  stagedAssetIdentity,
  type StagedAsset,
  type ThemeHistory,
  type ThemeVersion,
} from './theme-history';
import { generateThemePreviews } from '../use-cases/generate-theme-previews';
import { exportValidatedTheme, type ExportThemeOutcome } from '../use-cases/export-theme';
import { validateThemeFolder } from '../use-cases/validate-theme-folder';

/**
 * The theme the application currently has open, and everything that can be done to it.
 *
 * This is the editor's state, not Electron's: it holds no window, opens no dialog and knows
 * no path. The process around it decides *which* folder to open, *where* to export and
 * *which* file somebody picked, and hands each in. That keeps the workflow testable on its
 * own and means a second front end would drive the same object rather than reimplement it.
 *
 * It is also the only authority on what the theme currently is. An interface asks for a
 * change and is handed back the theme that resulted; it never keeps a second copy that could
 * drift away from this one.
 */

/**
 * Where the theme being edited came from.
 *
 * `project` is the one that has somewhere to be saved back to: a `.vitatheme` file the
 * person chose. The other two have nowhere of their own yet, so saving them asks where.
 */
export type ThemeOrigin = 'folder' | 'draft' | 'project';

export interface LoadedTheme {
  readonly origin: ThemeOrigin;
  /** What to call the theme in the interface. Never a path. */
  readonly label: string;
  readonly project: ThemeProject;
  readonly report: ValidationReport;
  readonly assets: readonly ThemeAssetSummary[];
  /** Whether there is a change to take back, and one to put back after taking it back. */
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Increases with every change, so a caller can tell what it is looking at apart. */
  readonly revision: number;
  /**
   * Increases only when the theme's files can have changed — one was brought in, or they
   * were all examined again. A change to a colour or a name leaves it alone, so anything
   * holding on to what a file looked like can keep it.
   */
  readonly assetRevision: number;
  /**
   * Whether the theme differs from what is on disk as a project.
   *
   * Decided here rather than in an interface, and decided by comparison rather than by a
   * flag somebody remembers to set: what would be written is compared with what was last
   * written, so undoing every change back to the saved state leaves nothing unsaved.
   */
  readonly isDirty: boolean;
}

export type ThemeLoadError = ThemeFolderError | ManifestParseError;

/** Opening a project can fail because of the file, or because of what is inside it. */
export type ProjectOpenError = ProjectStoreError | ProjectDocumentError;

export type ProjectSaveError =
  ProjectStoreError | { readonly code: 'no-theme-open'; readonly message: string };

export interface ExportDestination {
  readonly kind: 'folder' | 'archive';
  readonly path: string;
  readonly overwrite: boolean;
}

export type OpenThemeFolderAt = (path: string) => Promise<Result<ThemeFolder, ThemeFolderError>>;

export type OpenExportTargetAt = (
  destination: ExportDestination,
) => Promise<Result<ThemeExportTarget, ThemeExportFailure>>;

export interface ThemeSessionDependencies {
  readonly codec: ThemeManifestCodec;
  readonly openThemeFolderAt: OpenThemeFolderAt;
  readonly openExportTargetAt: OpenExportTargetAt;
  readonly externalFiles: ExternalFileStore;
  /** Reads and writes the `.vitatheme` document. Nothing else knows its shape. */
  readonly projectDocuments: ProjectDocumentCodec;
  /** Where projects and work in progress are kept. Nothing here knows how. */
  readonly projects: ProjectStore;
  /** Turns a picture into one a theme can use. Nothing here knows how it does it. */
  readonly images: ImageConverter;
}

export type SessionExportOutcome = ExportThemeOutcome;

export type EditFailureCode = ThemeEditError | 'no-theme-open';

export interface EditFailure {
  readonly code: EditFailureCode;
  /** User-facing summary. Never carries a stack trace or a machine-specific path. */
  readonly message: string;
}

export type AssignAssetFailureCode =
  | ExternalFileError['code']
  | ImageConversionError['code']
  | 'unusable-name'
  | 'no-theme-open'
  | 'unknown-page';

export interface AssignAssetFailure {
  readonly code: AssignAssetFailureCode;
  readonly message: string;
}

export type ConvertAssetFailureCode =
  | ImageConversionErrorCode
  | 'no-theme-open'
  /** The slot holds nothing, so there is nothing to convert. */
  | 'nothing-to-convert'
  /** Background music is not a picture. */
  | 'not-an-image'
  | 'unusable-name';

export interface ConvertAssetFailure {
  readonly code: ConvertAssetFailureCode;
  readonly message: string;
}

/**
 * What a conversion did, in the terms the person chose it in: what was there, and what is
 * there now. Both are the same description the application gives any other file.
 */
export interface AssetConversion {
  readonly theme: LoadedTheme;
  readonly source: InspectedAsset;
  readonly result: InspectedAsset;
}

export interface BulkImageConversion {
  readonly theme: LoadedTheme;
  readonly regeneratedThumbnails: number;
  readonly converted: readonly {
    readonly slot: ThemeAssetSlot;
    readonly source: InspectedAsset;
    readonly result: InspectedAsset;
  }[];
}

/** One file to put in one slot, as part of a set that is applied together. */
export interface AssetAssignment {
  readonly slot: ThemeAssetSlot;
  readonly location: string;
  /**
   * The file's own name, for saying what happened to it. Given rather than taken from the
   * location: the session derives nothing from a path, here as everywhere else.
   */
  readonly displayName: string;
}

export interface AssignedAsset {
  readonly slot: ThemeAssetSlot;
  /** The file's own name, so somebody can be told which file went where. Never a location. */
  readonly displayName: string;
}

export interface RejectedAssignment {
  readonly slot: ThemeAssetSlot;
  readonly displayName: string;
  readonly reason: string;
}

/**
 * What came of applying a set of files.
 *
 * One file being unusable does not throw away the rest: the ones that can be placed are
 * placed, the others are reported by name, and the whole thing is a single change to take
 * back.
 */
export interface BulkAssignment {
  readonly theme: LoadedTheme;
  readonly assigned: readonly AssignedAsset[];
  readonly rejected: readonly RejectedAssignment[];
}

export type GeneratePreviewsFailureCode = 'no-theme-open';

export interface GeneratePreviewsFailure {
  readonly code: GeneratePreviewsFailureCode;
  readonly message: string;
}

export interface GeneratedPreview {
  readonly kind: ThemePreviewKind;
  /** What was drawn, described the way every other file in the theme is. */
  readonly result: InspectedAsset;
}

export interface RefusedPreview {
  readonly kind: ThemePreviewKind;
  readonly message: string;
}

/**
 * What came of drawing a set of previews: the ones that were drawn, and why the rest were
 * not. One preview that cannot be drawn never stops the others.
 */
export interface PreviewGeneration {
  readonly theme: LoadedTheme;
  readonly generated: readonly GeneratedPreview[];
  readonly refused: readonly RefusedPreview[];
}

export type GeneratePageThumbnailFailure =
  | ImageConversionError
  | {
      readonly code:
        'no-theme-open' | 'unknown-page' | 'no-background' | 'unavailable' | 'unusable-name';
      readonly message: string;
    };

export interface ThemeSession {
  current(): LoadedTheme | null;
  /** Opens a theme folder. `label` is what to call it; the session never derives one from a path. */
  openFolder(path: string, label: string): Promise<Result<LoadedTheme, ThemeLoadError>>;
  /** Opens a saved project, with the files it keeps beside it. */
  openProject(path: string, label: string): Promise<Result<LoadedTheme, ProjectOpenError>>;
  startDraft(metadata: { readonly title: string; readonly provider: string }): LoadedTheme;
  /** Examines the theme's files again: they may have changed outside the application. */
  refresh(): Promise<LoadedTheme | null>;
  /** Closes the theme, and with it any work in progress that was being kept for it. */
  close(): Promise<void>;

  /**
   * Writes the project to a location, and takes it as the one the theme now belongs to.
   *
   * The history is untouched: saving records where the work has got to, and is not itself
   * a change to the theme that anybody would want to take back.
   */
  saveTo(path: string, label: string): Promise<Result<LoadedTheme, ProjectSaveError>>;
  /** Where the open project is saved, or null when it has never been saved. Never leaves this process. */
  projectLocation(): string | null;

  /** Whether an interrupted session left work that has not been saved. */
  hasRecovery(location: RecoveryLocation): Promise<boolean>;
  /** Opens work kept from an interrupted session. It arrives unsaved, because it is. */
  openRecovery(
    location: RecoveryLocation,
    label: string | null,
  ): Promise<Result<LoadedTheme, ProjectOpenError>>;
  /**
   * Keeps the work in progress, without saving the project. Changes nothing about the
   * session: not the history, not what is on screen, and not whether there is unsaved work.
   */
  writeRecovery(): Promise<boolean>;
  discardRecovery(location: RecoveryLocation): Promise<void>;

  /** Applies one named change and returns the theme that resulted, checked again. */
  applyEdit(edit: ThemeEdit): Promise<Result<LoadedTheme, EditFailure>>;
  /** Takes back the last change. Null when there is nothing to take back. */
  undo(): Promise<LoadedTheme | null>;
  /** Puts back a change that was taken back. Null when there is nothing to put back. */
  redo(): Promise<LoadedTheme | null>;
  /**
   * Brings a file into the theme. The file stays where it is until the theme is exported;
   * nothing the application is editing is written back over somebody's folder.
   */
  assignAsset(
    slot: ThemeAssetSlot,
    location: string,
  ): Promise<Result<LoadedTheme, AssignAssetFailure>>;
  /**
   * Brings several files into the theme as one change.
   *
   * The same path as bringing one in — every file is examined, named after its slot and
   * staged — but the history records it once, so a set of icons someone imported is undone
   * by one press rather than seventeen. A file that cannot be used is reported and the rest
   * still go in.
   */
  assignAssets(
    assignments: readonly AssetAssignment[],
  ): Promise<Result<BulkAssignment, AssignAssetFailure>>;
  /**
   * Makes what is in a slot into a picture the theme can use: the right size, the right
   * format, the colours the asset is conventionally written with.
   *
   * The file it came from is never touched. What the conversion produces takes the slot the
   * same way a file brought in does, so it is one change to take back, it makes the project
   * unsaved, and it is saved, previewed, validated and exported like anything else.
   */
  convertAsset(
    slot: ThemeAssetSlot,
    fit: ImageFit,
  ): Promise<Result<AssetConversion, ConvertAssetFailure>>;
  /** Converts every safe, known incompatible image as one atomic, undoable change. */
  convertIncompatibleImages(
    fit: 'cover' | 'contain',
  ): Promise<Result<BulkImageConversion, ConvertAssetFailure>>;
  /**
   * Draws the pictures a theme is browsed by, from the theme's own artwork.
   *
   * The whole set is one change to take back, however many were asked for. What is drawn
   * takes its slot the same way a file brought in does — staged, saved, validated and
   * exported like any other asset — and is recorded as the application's own work, so that
   * asking for previews again never writes over one somebody chose.
   *
   * Which previews may be drawn without asking is `generatablePreviews`, in the domain. This
   * draws exactly what it is asked for: a caller that names a slot holding somebody's own
   * picture is somebody pointing at that slot, which is a different thing from the
   * application deciding to.
   */
  generatePreviews(
    kinds: readonly ThemePreviewKind[],
  ): Promise<Result<PreviewGeneration, GeneratePreviewsFailure>>;
  /** Explicitly draws one page thumbnail from its background as a single undoable change. */
  generatePageThumbnail(page: number): Promise<Result<LoadedTheme, GeneratePageThumbnailFailure>>;
  /** Reads one of the theme's files, for showing it. Null when no theme is open. */
  readAsset(path: ThemeAssetPath): Promise<Result<Uint8Array, ThemeAssetReadError> | null>;

  exportTo(destination: ExportDestination): Promise<SessionExportOutcome | null>;
}

interface OpenTheme {
  readonly loaded: LoadedTheme;
  /** The theme's own files: a theme folder, a saved project's folder, or none yet. */
  readonly files: ThemeAssetSource | null;
  readonly staged: ReadonlyMap<ThemeAssetPath, StagedAsset>;
  readonly history: ThemeHistory;
  /** Where this theme is saved as a project, or null when it has never been saved. */
  readonly location: string | null;
  /**
   * What was last written, or what was opened and not yet touched. Null means there is no
   * such moment — recovered work, which is unsaved by definition.
   */
  readonly baseline: string | null;
  /**
   * The asset revision at the last save to `location`, so saving again can tell whether the
   * files beside the project still are the ones it refers to.
   */
  readonly savedAssetRevision: number | null;
  /**
   * What each file turned out to be, kept so that changing a theme's name does not send the
   * application back to the filesystem for every file it refers to.
   */
  readonly inspected: ReadonlyMap<ThemeAssetPath, AssetLookup>;
}

const EDIT_FAILURE_MESSAGES: Readonly<Record<EditFailureCode, string>> = {
  'no-theme-open': 'No theme is open.',
  'unknown-page': 'That LiveArea page is no longer part of the theme.',
  'invalid-colour':
    'That is not a colour the format can store. Use six hexadecimal digits, or eight to include transparency.',
  'invalid-content-version':
    'A theme version is two digits, a dot and two digits, for example 01.00.',
  'invalid-language-code': 'That is not a language code a theme can be translated into.',
  'invalid-number': 'That is not a whole number.',
  'too-many-pages': 'The PS Vita home screen has ten LiveArea pages, and they are all in use.',
  'last-page': 'A theme styles at least one LiveArea page.',
};

const ASSET_READ_ERRORS: Readonly<Record<ExternalFileError['code'], ThemeAssetReadError['code']>> =
  {
    missing: 'missing',
    'not-a-file': 'not-a-file',
    // Reading one of the theme's own files never involves a folder; both are here because
    // the store reports one set of codes, and neither can reach this path.
    'not-a-folder': 'not-a-file',
    'too-many-entries': 'unreadable',
    'too-large': 'too-large',
    unreadable: 'unreadable',
  };

const draftLabel = (title: string): string => {
  const trimmed = title.trim();
  return trimmed.length === 0 ? 'Untitled theme' : trimmed;
};

export const createThemeSession = ({
  codec,
  openThemeFolderAt,
  openExportTargetAt,
  externalFiles,
  projectDocuments,
  projects,
  images,
}: ThemeSessionDependencies): ThemeSession => {
  let open: OpenTheme | null = null;
  /**
   * Tells one picture this application produced from another; only ever compared, never
   * shown or stored. Converting and drawing a preview both take a number from here, because
   * both put a file in the theme that has nowhere else to be.
   */
  let conversions = 0;

  /**
   * Everything a save would write, as one string.
   *
   * The document covers the theme itself. The files brought in from elsewhere are named
   * alongside it because a file keeps its slot's name when it replaces another: without
   * them, swapping one background for a different one would look like no change at all.
   */
  const signatureOf = (
    project: ThemeProject,
    staged: ReadonlyMap<ThemeAssetPath, StagedAsset>,
  ): string =>
    [
      projectDocuments.serialize(project),
      ...[...staged]
        .map(([name, asset]) => `${name}\u0000${stagedAssetIdentity(asset)}`)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
    ].join('\u0001');

  const isDirtyAgainst = (theme: OpenTheme, project: ThemeProject): boolean =>
    theme.baseline === null || signatureOf(project, theme.staged) !== theme.baseline;

  const recoveryLocationOf = (theme: OpenTheme): RecoveryLocation =>
    theme.location === null ? { kind: 'untitled' } : { kind: 'project', path: theme.location };

  /**
   * What the theme's files are read through: whatever has been brought in during this
   * session, then the folder the theme came from. Staged files win, because they are what
   * the theme now refers to.
   */
  const sourceFor = (theme: OpenTheme): ThemeAssetSource => ({
    inspectAsset: async (path) => {
      const staged = theme.staged.get(path);
      if (staged === undefined) {
        return (await theme.files?.inspectAsset(path)) ?? { status: 'missing' };
      }

      // A picture this application produced is exactly what it was made to be; only a file
      // somebody chose has to be looked at again, because only that one can have changed.
      if (staged.kind === 'converted') {
        return { status: 'found', asset: staged.inspected };
      }

      const inspected = await externalFiles.inspect(staged.file.reference);
      if (inspected.ok) {
        return { status: 'found', asset: inspected.value.inspected };
      }

      return inspected.error.code === 'missing'
        ? { status: 'missing' }
        : { status: 'unreadable', reason: 'the file it was taken from could not be read' };
    },

    openAsset: async (path) => {
      const staged = theme.staged.get(path);
      if (staged === undefined) {
        return (
          (await theme.files?.openAsset(path)) ??
          failure<ThemeAssetReadError>({
            code: 'missing',
            message: `The theme refers to "${path}", but that file is not part of it.`,
          })
        );
      }

      if (staged.kind === 'converted') {
        return success(staged.bytes);
      }

      const read = await externalFiles.read(staged.file.reference);
      return read.ok
        ? read
        : failure<ThemeAssetReadError>({
            code: ASSET_READ_ERRORS[read.error.code],
            message: read.error.message,
          });
    },
  });

  /** The one thumbnail recipe: the canonical target and a centred, proportional crop. */
  const drawPageThumbnail = (bytes: Uint8Array) =>
    images.convert(bytes, imageConversionTarget('liveAreaThumbnail'), 'cover');

  const stagePageThumbnail = (
    project: ThemeProject,
    page: number,
    image: ConvertedImage,
    staged: Map<ThemeAssetPath, StagedAsset>,
    inspected: Map<ThemeAssetPath, AssetLookup>,
    id: number,
  ): Result<ThemeProject, { readonly code: 'unusable-name'; readonly message: string }> => {
    const name = assetSlotFileName({ kind: 'liveAreaThumbnail', page }, image.inspected.media);
    if (!name.ok) {
      return failure({
        code: 'unusable-name',
        message: 'The generated thumbnail cannot be named for this theme.',
      });
    }
    staged.set(name.value, {
      kind: 'converted',
      bytes: image.bytes,
      inspected: image.inspected,
      id: String(id),
    });
    inspected.set(name.value, { status: 'found', asset: image.inspected });
    return success(withGeneratedPageThumbnail(project, page, name.value));
  };

  /**
   * Checks the theme, inspecting only files it has not already looked at. An edit that
   * changes a name or a colour touches no file at all.
   */
  const describe = async (
    theme: OpenTheme,
    project: ThemeProject,
    revision: number,
    assetRevision: number,
  ): Promise<OpenTheme> => {
    const source = sourceFor(theme);
    const inspected = new Map(theme.inspected);

    for (const path of distinctAssetPaths(project)) {
      if (!inspected.has(path)) {
        inspected.set(path, await source.inspectAsset(path));
      }
    }

    const catalog = assetCatalogOf(inspected);

    return {
      ...theme,
      inspected,
      loaded: {
        origin: theme.loaded.origin,
        label: theme.loaded.label,
        project,
        report: validateThemeProject(project, catalog),
        assets: summarizeThemeAssets(project, catalog),
        canUndo: theme.history.past.length > 0,
        canRedo: theme.history.future.length > 0,
        revision,
        assetRevision,
        isDirty: isDirtyAgainst(theme, project),
      },
    };
  };

  /** The version of the theme that is open now, for putting on the history. */
  const versionOf = (theme: OpenTheme): ThemeVersion => ({
    project: theme.loaded.project,
    staged: theme.staged,
  });

  /**
   * Whether a change changed anything.
   *
   * Two themes that would be written to the same `theme.xml` are the same theme, so this is
   * exact — and it is the reason setting a field to what it already said leaves no step to
   * take back.
   */
  const isSameTheme = (before: ThemeProject, after: ThemeProject): boolean =>
    codec.serialize(before) === codec.serialize(after);

  /**
   * Goes to a version of the theme that was recorded earlier.
   *
   * What was examined about the theme's own folder still holds, so it is kept; what was
   * examined about files brought in from elsewhere does not, because the same name may now
   * stand for a different file — or for one that has since been deleted, which is then
   * reported rather than quietly replaced with something else.
   */
  const restore = async (theme: OpenTheme, version: ThemeVersion, history: ThemeHistory) => {
    const inspected = new Map(theme.inspected);
    for (const path of new Set([...theme.staged.keys(), ...version.staged.keys()])) {
      inspected.delete(path);
    }

    return describe(
      { ...theme, staged: version.staged, inspected, history },
      version.project,
      nextRevision(),
      assetRevisionOf(theme, true),
    );
  };

  const nextRevision = (): number => (open?.loaded.revision ?? 0) + 1;

  /** Unchanged unless the files themselves can have. */
  const assetRevisionOf = (theme: OpenTheme | null, filesMayHaveChanged: boolean): number =>
    (theme?.loaded.assetRevision ?? 0) + (filesMayHaveChanged ? 1 : 0);

  const loadFolder = async (
    folder: ThemeFolder,
    label: string,
  ): Promise<Result<LoadedTheme, ThemeLoadError>> => {
    const outcome = await validateThemeFolder({ folder, codec });
    if (outcome.status === 'unopenable') {
      return failure(outcome.error);
    }

    const revision = nextRevision();
    open = {
      files: folder,
      staged: new Map(),
      inspected: new Map(),
      history: NO_HISTORY,
      location: null,
      // A theme just opened is exactly what is on disk, so there is nothing unsaved yet.
      // It has no project of its own, so saving it will ask where to put one.
      baseline: signatureOf(outcome.project, new Map()),
      savedAssetRevision: null,
      loaded: {
        origin: 'folder',
        label,
        project: outcome.project,
        report: outcome.report,
        assets: summarizeThemeAssets(outcome.project, outcome.catalog),
        canUndo: false,
        canRedo: false,
        revision,
        assetRevision: assetRevisionOf(open, true),
        isDirty: false,
      },
    };

    // The catalog the validation just built is the answer for every file the theme names.
    open = {
      ...open,
      inspected: new Map(
        open.loaded.assets.map((summary) => [summary.path, summary.lookup] as const),
      ),
    };

    return success(open.loaded);
  };

  /**
   * Replaces whatever is open with a project that has already been read and understood.
   *
   * Nothing before this point touches the session: a project that turns out to be damaged
   * leaves the theme somebody was working on exactly as it was.
   */
  const loadProject = async (
    stored: StoredProject,
    project: ThemeProject,
    label: string,
    location: string | null,
    saved: boolean,
  ): Promise<LoadedTheme> => {
    const base: OpenTheme = {
      files: stored.assets,
      staged: new Map(),
      inspected: new Map(),
      history: NO_HISTORY,
      location,
      // Recovered work has never been written as a project, whatever it was recovered from.
      baseline: saved ? signatureOf(project, new Map()) : null,
      savedAssetRevision: null,
      loaded: {
        origin: location === null ? 'draft' : 'project',
        label,
        project,
        report: validateThemeProject(project, assetCatalogOf(new Map())),
        assets: [],
        canUndo: false,
        canRedo: false,
        revision: nextRevision(),
        assetRevision: assetRevisionOf(open, true),
        isDirty: !saved,
      },
    };

    open = await describe(base, project, base.loaded.revision, base.loaded.assetRevision);
    return open.loaded;
  };

  const readProjectDocument = (
    stored: Result<StoredProject, ProjectStoreError>,
  ): Result<{ stored: StoredProject; project: ThemeProject }, ProjectOpenError> => {
    if (!stored.ok) {
      return failure(stored.error);
    }

    const parsed = projectDocuments.parse(stored.value.document);
    return parsed.ok
      ? success({ stored: stored.value, project: parsed.value })
      : failure(parsed.error);
  };

  /**
   * Examines the theme's files again.
   *
   * The theme itself is what is being edited, and stays as it is: reading the manifest back
   * over somebody's unfinished work would be a way to lose it, not a way to check it. What
   * this answers is whether the files the theme refers to are still there and still what they
   * were — which is what changes behind the application's back.
   */
  const refresh = async (): Promise<LoadedTheme | null> => {
    const theme = open;
    if (theme === null) {
      return null;
    }

    open = await describe(
      { ...theme, inspected: new Map() },
      theme.loaded.project,
      nextRevision(),
      assetRevisionOf(theme, true),
    );
    return open.loaded;
  };

  const editFailure = (code: EditFailureCode): EditFailure => ({
    code,
    message: EDIT_FAILURE_MESSAGES[code],
  });

  return {
    current: () => open?.loaded ?? null,

    openFolder: async (path, label) => {
      const opened = await openThemeFolderAt(path);
      return opened.ok ? loadFolder(opened.value, label) : failure(opened.error);
    },

    openProject: async (path, label) => {
      const read = readProjectDocument(await projects.read(path));
      return read.ok
        ? success(await loadProject(read.value.stored, read.value.project, label, path, true))
        : failure(read.error);
    },

    openRecovery: async (location, label) => {
      const read = readProjectDocument(await projects.readRecovery(location));
      if (!read.ok) {
        return failure(read.error);
      }

      const { stored, project } = read.value;
      return success(
        await loadProject(
          stored,
          project,
          label ?? draftLabel(project.metadata.title.defaultValue),
          location.kind === 'project' ? location.path : null,
          false,
        ),
      );
    },

    saveTo: async (path, label) => {
      const theme = open;
      if (theme === null) {
        return failure({ code: 'no-theme-open', message: EDIT_FAILURE_MESSAGES['no-theme-open'] });
      }

      const { project } = theme.loaded;
      // The files are rewritten unless they are already the ones beside this project:
      // saving a theme whose artwork has not changed should cost a few kilobytes of text,
      // not a copy of everything it refers to.
      const filesAreInPlace =
        theme.location === path && theme.savedAssetRevision === theme.loaded.assetRevision;

      const source = sourceFor(theme);
      const written = await projects.write(
        path,
        projectDocuments.serialize(project),
        filesAreInPlace
          ? null
          : { paths: distinctAssetPaths(project), open: (asset) => source.openAsset(asset) },
      );

      if (!written.ok) {
        // Nothing about the session changes: the work is still here, and still unsaved.
        return failure(written.error);
      }

      // Work in progress is superseded by a real save — both the one kept beside this
      // project and the one kept for a project that had nowhere to be saved until now.
      await projects.removeRecovery({ kind: 'project', path });
      if (theme.location !== path) {
        await projects.removeRecovery(recoveryLocationOf(theme));
      }

      open = {
        ...theme,
        location: path,
        baseline: signatureOf(project, theme.staged),
        savedAssetRevision: theme.loaded.assetRevision,
        loaded: { ...theme.loaded, origin: 'project', label, isDirty: false },
      };

      return success(open.loaded);
    },

    projectLocation: () => open?.location ?? null,

    hasRecovery: (location) => projects.hasRecovery(location),

    writeRecovery: async () => {
      const theme = open;
      if (theme?.loaded.isDirty !== true) {
        return false;
      }

      const written = await projects.writeRecovery(
        recoveryLocationOf(theme),
        projectDocuments.serialize(theme.loaded.project),
      );
      return written.ok;
    },

    discardRecovery: (location) => projects.removeRecovery(location),

    startDraft: (metadata) => {
      const revision = nextRevision();
      const project = newThemeProject(metadata);

      open = {
        files: null,
        staged: new Map(),
        inspected: new Map(),
        history: NO_HISTORY,
        location: null,
        // A theme nobody has touched holds no work, so closing it loses nothing and there
        // is nothing to ask about. It becomes unsaved the moment it is edited.
        baseline: signatureOf(project, new Map()),
        savedAssetRevision: null,
        loaded: {
          origin: 'draft',
          label: draftLabel(metadata.title),
          project,
          report: validateThemeProject(project, assetCatalogOf(new Map())),
          assets: [],
          canUndo: false,
          canRedo: false,
          revision,
          assetRevision: assetRevisionOf(open, true),
          isDirty: false,
        },
      };

      return open.loaded;
    },

    refresh,

    close: async () => {
      const theme = open;
      open = null;

      // Whatever was being kept for this theme is no longer wanted: it was either saved, or
      // deliberately given up. Either way it must not be offered back later.
      if (theme !== null) {
        await projects.removeRecovery(recoveryLocationOf(theme));
      }
    },

    applyEdit: async (edit) => {
      const theme = open;
      if (theme === null) {
        return failure(editFailure('no-theme-open'));
      }

      const edited = applyThemeEdit(theme.loaded.project, edit);
      if (!edited.ok) {
        return failure(editFailure(edited.error));
      }

      // Setting a field to what it already said is not a change, and leaves nothing to undo.
      if (isSameTheme(theme.loaded.project, edited.value)) {
        return success(theme.loaded);
      }

      // A change to a name or a colour touches no file, so anything showing one may keep it.
      open = await describe(
        {
          ...theme,
          history: historyAfterChange(theme.history, versionOf(theme), coalescingKeyOf(edit)),
        },
        edited.value,
        nextRevision(),
        assetRevisionOf(theme, false),
      );
      return success(open.loaded);
    },

    undo: async () => {
      const theme = open;
      const previous = theme?.history.past.at(-1);
      if (theme === null || previous === undefined) {
        return null;
      }

      open = await restore(theme, previous, historyAfterUndo(theme.history, versionOf(theme)));
      return open.loaded;
    },

    redo: async () => {
      const theme = open;
      const next = theme?.history.future[0];
      if (theme === null || next === undefined) {
        return null;
      }

      open = await restore(theme, next, historyAfterRedo(theme.history, versionOf(theme)));
      return open.loaded;
    },

    assignAsset: async (slot, location) => {
      const theme = open;
      if (theme === null) {
        return failure({ code: 'no-theme-open', message: EDIT_FAILURE_MESSAGES['no-theme-open'] });
      }
      if (
        (slot.kind === 'liveAreaBackground' || slot.kind === 'liveAreaThumbnail') &&
        theme.loaded.project.home.pages[slot.page] === undefined
      ) {
        return failure({ code: 'unknown-page', message: EDIT_FAILURE_MESSAGES['unknown-page'] });
      }

      const inspected = await externalFiles.inspect(location);
      if (!inspected.ok) {
        return failure(inspected.error);
      }

      const file = inspected.value;
      // Named after the slot and after what the file turned out to be — never after what it
      // was called, which is somebody else's text.
      const name = assetSlotFileName(slot, file.inspected.media);
      if (!name.ok) {
        return failure({
          code: 'unusable-name',
          message: 'That file cannot be given a name this theme can refer to.',
        });
      }

      const generateThumbnail =
        slot.kind === 'liveAreaBackground' &&
        pageThumbnailSource(theme.loaded.project, slot.page) !== 'custom';
      const convertThumbnail = slot.kind === 'liveAreaThumbnail';
      let thumbnail: ConvertedImage | null = null;
      if (generateThumbnail || convertThumbnail) {
        const read = await externalFiles.read(file.reference);
        if (!read.ok) return failure(read.error);
        const output = await drawPageThumbnail(read.value);
        if (!output.ok) return failure(output.error);
        thumbnail = output.value;
      }

      const staged = new Map(theme.staged);
      const inspectedFiles = new Map(theme.inspected);
      let project: ThemeProject;
      let nextConversion = conversions;
      if (convertThumbnail && thumbnail !== null) {
        const convertedName = assetSlotFileName(slot, thumbnail.inspected.media);
        if (!convertedName.ok) {
          return failure({ code: 'unusable-name', message: 'The thumbnail cannot be named.' });
        }
        nextConversion += 1;
        staged.set(convertedName.value, {
          kind: 'converted',
          bytes: thumbnail.bytes,
          inspected: thumbnail.inspected,
          id: String(nextConversion),
        });
        inspectedFiles.set(convertedName.value, { status: 'found', asset: thumbnail.inspected });
        project = withAssetAtSlot(theme.loaded.project, slot, convertedName.value);
      } else {
        staged.set(name.value, { kind: 'file', file });
        inspectedFiles.set(name.value, { status: 'found', asset: file.inspected });
        project = withAssetAtSlot(theme.loaded.project, slot, name.value);
        if (generateThumbnail && thumbnail !== null) {
          nextConversion += 1;
          const stagedThumbnail = stagePageThumbnail(
            project,
            slot.page,
            thumbnail,
            staged,
            inspectedFiles,
            nextConversion,
          );
          if (!stagedThumbnail.ok) return failure(stagedThumbnail.error);
          project = stagedThumbnail.value;
        }
      }

      // Recorded with the files it was holding: a replacement keeps the slot's name, so the
      // name alone would not say which file the theme had before.
      const history = historyAfterChange(theme.history, versionOf(theme), null);

      open = await describe(
        { ...theme, staged, inspected: inspectedFiles, history },
        project,
        nextRevision(),
        assetRevisionOf(theme, true),
      );

      conversions = nextConversion;

      return success(open.loaded);
    },

    assignAssets: async (assignments) => {
      const theme = open;
      if (theme === null) {
        return failure({ code: 'no-theme-open', message: EDIT_FAILURE_MESSAGES['no-theme-open'] });
      }

      const staged = new Map(theme.staged);
      const inspectedFiles = new Map(theme.inspected);
      const assigned: AssignedAsset[] = [];
      const rejected: RejectedAssignment[] = [];
      let project = theme.loaded.project;

      for (const { slot, location, displayName } of assignments) {
        const inspected = await externalFiles.inspect(location);
        if (!inspected.ok) {
          rejected.push({ slot, displayName, reason: inspected.error.message });
          continue;
        }

        const file = inspected.value;
        const name = assetSlotFileName(slot, file.inspected.media);
        if (!name.ok) {
          rejected.push({
            slot,
            displayName,
            reason: 'That file cannot be given a name this theme can refer to.',
          });
          continue;
        }

        staged.set(name.value, { kind: 'file', file });
        inspectedFiles.set(name.value, { status: 'found', asset: file.inspected });
        project = withAssetAtSlot(project, slot, name.value);
        assigned.push({ slot, displayName });
      }

      // Nothing usable in the set: the theme is untouched, and so is the history.
      if (assigned.length === 0) {
        return success({ theme: theme.loaded, assigned, rejected });
      }

      const history = historyAfterChange(theme.history, versionOf(theme), null);
      open = await describe(
        { ...theme, staged, inspected: inspectedFiles, history },
        project,
        nextRevision(),
        assetRevisionOf(theme, true),
      );

      return success({ theme: open.loaded, assigned, rejected });
    },

    convertAsset: async (slot, fit) => {
      const theme = open;
      if (theme === null) {
        return failure({ code: 'no-theme-open', message: EDIT_FAILURE_MESSAGES['no-theme-open'] });
      }

      const usage = assetSlotUsage(slot);
      if (usage === 'backgroundMusic') {
        return failure({
          code: 'not-an-image',
          message: 'Background music is a sound file, so there is nothing to convert here.',
        });
      }

      const path = assetAtSlot(theme.loaded.project, slot);
      if (path === null) {
        return failure({
          code: 'nothing-to-convert',
          message: 'There is nothing in that slot to convert. Choose a picture first.',
        });
      }

      // Read through the session's own view of the theme's files, so a picture brought in a
      // moment ago and one that came with the theme are converted the same way.
      const source = sourceFor(theme);
      const inspected = await source.inspectAsset(path);
      if (inspected.status !== 'found') {
        return failure({
          code: 'not-an-image',
          message:
            inspected.status === 'missing'
              ? `"${path}" is not there any more, so it cannot be converted.`
              : `"${path}" could not be read: ${inspected.reason}.`,
        });
      }

      const read = await source.openAsset(path);
      if (!read.ok) {
        return failure({ code: 'not-an-image', message: read.error.message });
      }

      const converted = await images.convert(read.value, imageConversionTarget(usage), fit);
      if (!converted.ok) {
        // Nothing has been touched: the theme is exactly as it was before the conversion.
        return failure(converted.error);
      }

      const name = assetSlotFileName(slot, converted.value.inspected.media);
      if (!name.ok) {
        return failure({
          code: 'unusable-name',
          message: 'The converted picture cannot be given a name this theme can refer to.',
        });
      }

      let thumbnail: ConvertedImage | null = null;
      if (
        slot.kind === 'liveAreaBackground' &&
        pageThumbnailSource(theme.loaded.project, slot.page) === 'generated'
      ) {
        const drawn = await drawPageThumbnail(converted.value.bytes);
        if (!drawn.ok) return failure(drawn.error);
        thumbnail = drawn.value;
      }

      let nextConversion = conversions + 1;
      const staged = new Map(theme.staged);
      staged.set(name.value, {
        kind: 'converted',
        bytes: converted.value.bytes,
        inspected: converted.value.inspected,
        id: String(nextConversion),
      });

      const inspectedFiles = new Map(theme.inspected);
      inspectedFiles.set(name.value, { status: 'found', asset: converted.value.inspected });
      let project = withAssetAtSlot(theme.loaded.project, slot, name.value);
      if (thumbnail !== null && slot.kind === 'liveAreaBackground') {
        nextConversion += 1;
        const stagedThumbnail = stagePageThumbnail(
          project,
          slot.page,
          thumbnail,
          staged,
          inspectedFiles,
          nextConversion,
        );
        if (!stagedThumbnail.ok) return failure(stagedThumbnail.error);
        project = stagedThumbnail.value;
      }

      // One step to take back, recorded with the files the theme was holding — the same as
      // bringing a file in, because that is what a conversion is from the theme's side.
      const history = historyAfterChange(theme.history, versionOf(theme), null);

      open = await describe(
        { ...theme, staged, inspected: inspectedFiles, history },
        project,
        nextRevision(),
        assetRevisionOf(theme, true),
      );

      conversions = nextConversion;

      return success({
        theme: open.loaded,
        source: inspected.asset,
        result: converted.value.inspected,
      });
    },

    convertIncompatibleImages: async (fit) => {
      const theme = open;
      if (theme === null) {
        return failure({ code: 'no-theme-open', message: EDIT_FAILURE_MESSAGES['no-theme-open'] });
      }

      const slots = incompatibleImageSlots(theme.loaded.project, theme.loaded.assets);
      const repairPages = theme.loaded.project.home.pages.flatMap((page, index) => {
        if (!page.generatedThumbnail || page.background === null || page.thumbnail === null)
          return [];
        if (slots.some((slot) => slot.kind === 'liveAreaBackground' && slot.page === index))
          return [];
        const summary = theme.loaded.assets.find((asset) => asset.path === page.thumbnail);
        const needsRepair =
          summary?.lookup.status !== 'found' ||
          imageConversionWouldChange(
            imageConversionTarget('liveAreaThumbnail'),
            summary.lookup.asset.media,
          );
        return needsRepair ? [index] : [];
      });
      if (slots.length === 0 && repairPages.length === 0) {
        return success({ theme: theme.loaded, converted: [], regeneratedThumbnails: 0 });
      }

      const source = sourceFor(theme);
      const staged = new Map(theme.staged);
      const inspectedFiles = new Map(theme.inspected);
      const converted: { slot: ThemeAssetSlot; source: InspectedAsset; result: InspectedAsset }[] =
        [];
      let project = theme.loaded.project;
      let nextConversion = conversions;
      let regeneratedThumbnails = 0;

      for (const slot of slots) {
        const path = assetAtSlot(theme.loaded.project, slot);
        if (path === null) {
          return failure({
            code: 'nothing-to-convert',
            message: 'An image slot changed before conversion.',
          });
        }

        const inspected = await source.inspectAsset(path);
        if (inspected.status !== 'found' || inspected.asset.media.kind !== 'image') {
          return failure({
            code: 'not-an-image',
            message: `“${path}” is no longer an available image.`,
          });
        }
        const read = await source.openAsset(path);
        if (!read.ok) {
          return failure({ code: 'not-an-image', message: read.error.message });
        }
        const usage = assetSlotUsage(slot);
        if (usage === 'backgroundMusic') {
          return failure({
            code: 'not-an-image',
            message: 'Music cannot be converted as an image.',
          });
        }
        const output = await images.convert(read.value, imageConversionTarget(usage), fit);
        if (!output.ok) {
          return failure(output.error);
        }
        const name = assetSlotFileName(slot, output.value.inspected.media);
        if (!name.ok) {
          return failure({
            code: 'unusable-name',
            message: 'A converted image cannot be named for this theme.',
          });
        }

        nextConversion += 1;
        staged.set(name.value, {
          kind: 'converted',
          bytes: output.value.bytes,
          inspected: output.value.inspected,
          id: String(nextConversion),
        });
        inspectedFiles.set(name.value, { status: 'found', asset: output.value.inspected });
        project = withAssetAtSlot(project, slot, name.value);
        converted.push({ slot, source: inspected.asset, result: output.value.inspected });
        if (
          slot.kind === 'liveAreaBackground' &&
          pageThumbnailSource(theme.loaded.project, slot.page) === 'generated'
        ) {
          const thumbnail = await drawPageThumbnail(output.value.bytes);
          if (!thumbnail.ok) return failure(thumbnail.error);
          nextConversion += 1;
          const stagedThumbnail = stagePageThumbnail(
            project,
            slot.page,
            thumbnail.value,
            staged,
            inspectedFiles,
            nextConversion,
          );
          if (!stagedThumbnail.ok) return failure(stagedThumbnail.error);
          project = stagedThumbnail.value;
          regeneratedThumbnails += 1;
        }
      }

      for (const page of repairPages) {
        const background = project.home.pages[page]?.background;
        if (background === undefined || background === null) continue;
        const read = await sourceFor({ ...theme, staged }).openAsset(background);
        if (!read.ok) return failure({ code: 'not-an-image', message: read.error.message });
        const thumbnail = await drawPageThumbnail(read.value);
        if (!thumbnail.ok) return failure(thumbnail.error);
        nextConversion += 1;
        const stagedThumbnail = stagePageThumbnail(
          project,
          page,
          thumbnail.value,
          staged,
          inspectedFiles,
          nextConversion,
        );
        if (!stagedThumbnail.ok) return failure(stagedThumbnail.error);
        project = stagedThumbnail.value;
        regeneratedThumbnails += 1;
      }

      const history = historyAfterChange(theme.history, versionOf(theme), null);
      open = await describe(
        { ...theme, staged, inspected: inspectedFiles, history },
        project,
        nextRevision(),
        assetRevisionOf(theme, true),
      );
      conversions = nextConversion;
      return success({ theme: open.loaded, converted, regeneratedThumbnails });
    },

    generatePageThumbnail: async (page) => {
      const theme = open;
      if (theme === null) {
        return failure({ code: 'no-theme-open', message: EDIT_FAILURE_MESSAGES['no-theme-open'] });
      }
      const current = theme.loaded.project.home.pages[page];
      if (current === undefined) {
        return failure({ code: 'unknown-page', message: EDIT_FAILURE_MESSAGES['unknown-page'] });
      }
      if (current.background === null) {
        return failure({
          code: 'no-background',
          message: 'Choose a LiveArea page background before generating its thumbnail.',
        });
      }

      const read = await sourceFor(theme).openAsset(current.background);
      if (!read.ok) return failure({ code: 'unavailable', message: read.error.message });
      const image = await drawPageThumbnail(read.value);
      if (!image.ok) return failure(image.error);

      const staged = new Map(theme.staged);
      const inspected = new Map(theme.inspected);
      const nextConversion = conversions + 1;
      const project = stagePageThumbnail(
        theme.loaded.project,
        page,
        image.value,
        staged,
        inspected,
        nextConversion,
      );
      if (!project.ok) return failure(project.error);

      const history = historyAfterChange(theme.history, versionOf(theme), null);
      open = await describe(
        { ...theme, staged, inspected, history },
        project.value,
        nextRevision(),
        assetRevisionOf(theme, true),
      );
      conversions = nextConversion;
      return success(open.loaded);
    },

    generatePreviews: async (kinds) => {
      const theme = open;
      if (theme === null) {
        return failure({ code: 'no-theme-open', message: EDIT_FAILURE_MESSAGES['no-theme-open'] });
      }

      const drawn = await generateThemePreviews({
        project: theme.loaded.project,
        assets: sourceFor(theme),
        images,
        kinds,
      });

      const staged = new Map(theme.staged);
      const inspectedFiles = new Map(theme.inspected);
      const generated: GeneratedPreview[] = [];
      const refused: RefusedPreview[] = drawn.refused.map(({ kind, message }) => ({
        kind,
        message,
      }));
      let project = theme.loaded.project;

      for (const image of drawn.generated) {
        const name = assetSlotFileName(previewAssetSlot(image.kind), image.inspected.media);
        if (!name.ok) {
          refused.push({
            kind: image.kind,
            message: 'The picture that was drawn cannot be given a name this theme can refer to.',
          });
          continue;
        }

        conversions += 1;
        staged.set(name.value, {
          kind: 'converted',
          bytes: image.bytes,
          inspected: image.inspected,
          id: String(conversions),
        });
        inspectedFiles.set(name.value, { status: 'found', asset: image.inspected });
        project = withGeneratedPreview(project, image.kind, name.value);
        generated.push({ kind: image.kind, result: image.inspected });
      }

      // Nothing was drawn: the theme is untouched, and so is the history.
      if (generated.length === 0) {
        return success({ theme: theme.loaded, generated, refused });
      }

      // One step to take back, however many pictures it drew, recorded with the files the
      // theme was holding — a preview drawn again keeps its slot's name.
      const history = historyAfterChange(theme.history, versionOf(theme), null);

      open = await describe(
        { ...theme, staged, inspected: inspectedFiles, history },
        project,
        nextRevision(),
        assetRevisionOf(theme, true),
      );

      return success({ theme: open.loaded, generated, refused });
    },

    readAsset: async (path) => (open === null ? null : sourceFor(open).openAsset(path)),

    exportTo: async (destination) => {
      // Examined again first: every file has to still be there, and still be what it was,
      // at the moment it is written rather than when it was chosen.
      const refreshed = await refresh();
      const theme = open;
      if (refreshed === null || theme === null) {
        return null;
      }

      const target = await openExportTargetAt(destination);
      if (!target.ok) {
        return { status: 'failed', failure: target.error };
      }

      return exportValidatedTheme({
        project: refreshed.project,
        report: refreshed.report,
        assets: sourceFor(theme),
        codec,
        target: target.value,
      });
    },
  };
};
