import type { ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type {
  AppDescription,
  ExportFormat,
  ConvertAssetResult,
  ExportResult,
  GeneratePreviewsResult,
  IconSetImportResult,
  ProjectSaveResult,
  SessionSnapshot,
  ThemeLoadResult,
} from '@/ipc';
import type { InspectedAsset } from '@/domain/model/media';
import { formatByteSize, formatPixels } from '../format';
import { sectionForSurface, surfaceForSection, type PreviewSurfaceId } from '../preview/surfaces';
import type { SectionId } from './sections';

/**
 * Everything the window is showing, and the only ways it changes.
 *
 * The theme itself is not kept here: it belongs to the privileged side, which sends a whole
 * snapshot whenever it changes. What this holds is what the interface has decided — which
 * section is open, what is selected, what is being waited for — so the two never disagree
 * about the theme, and this file stays a plain reducer that can be tested without a browser.
 */

export type PendingAction =
  'opening' | 'refreshing' | 'exporting' | 'assigning' | 'saving' | 'converting' | 'drawing' | null;

/** The workspace is either being edited in or looked at. */
export type WorkspaceMode = 'edit' | 'preview';

export type EditorDialog =
  | { readonly kind: 'new-theme' }
  /** Turning what is in a slot into a picture the theme can use. */
  | { readonly kind: 'convert-asset'; readonly slot: ThemeAssetSlot; readonly label: string }
  | { readonly kind: 'convert-images' }
  /** Something is already where the theme would be written; exporting again replaces it. */
  | { readonly kind: 'confirm-replacement'; readonly name: string; readonly format: ExportFormat };

export type NoticeTone = 'success' | 'warning' | 'error';

export interface Notice {
  readonly tone: NoticeTone;
  readonly message: string;
}

export interface EditorState {
  readonly session: SessionSnapshot;
  readonly app: AppDescription | null;
  readonly mode: WorkspaceMode;
  readonly section: SectionId;
  readonly surface: PreviewSurfaceId;
  /**
   * The LiveArea page being worked on. Shared by the editor and the preview, so the two are
   * never looking at different pages of the same theme.
   */
  readonly selectedPage: number;
  readonly pending: PendingAction;
  readonly dialog: EditorDialog | null;
  readonly notice: Notice | null;
  /** The asset a reported problem pointed at, highlighted until something else is chosen. */
  readonly highlightedAsset: string | null;
}

export const initialEditorState: EditorState = {
  session: { theme: null, lastExport: null, recovery: null, recentProjects: [] },
  app: null,
  mode: 'edit',
  section: 'overview',
  surface: 'theme-list',
  selectedPage: 0,
  pending: null,
  dialog: null,
  notice: null,
  highlightedAsset: null,
};

export type EditorAction =
  | { readonly type: 'app-described'; readonly app: AppDescription }
  | { readonly type: 'session-changed'; readonly session: SessionSnapshot }
  | { readonly type: 'section-selected'; readonly section: SectionId }
  | { readonly type: 'mode-selected'; readonly mode: WorkspaceMode }
  | { readonly type: 'mode-toggled' }
  | { readonly type: 'surface-selected'; readonly surface: PreviewSurfaceId }
  | { readonly type: 'page-selected'; readonly page: number }
  | { readonly type: 'asset-highlighted'; readonly path: string | null }
  | { readonly type: 'pending-changed'; readonly pending: PendingAction }
  | { readonly type: 'dialog-opened'; readonly dialog: EditorDialog }
  | { readonly type: 'dialog-closed' }
  | { readonly type: 'notice-shown'; readonly notice: Notice }
  | { readonly type: 'notice-dismissed' };

export const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'app-described':
      return { ...state, app: action.app };

    case 'session-changed': {
      const closed = action.session.theme === null;
      const pages = action.session.theme?.project.home.pages.length ?? 0;

      return {
        ...state,
        session: action.session,
        // A closed theme leaves nothing to be selected inside; a newly opened one starts
        // where someone would look first rather than wherever the last theme was left.
        mode: closed ? 'edit' : state.mode,
        section: closed ? 'overview' : state.section,
        // A page can be removed while it is the one being looked at.
        selectedPage: Math.max(Math.min(state.selectedPage, pages - 1), 0),
        highlightedAsset: closed ? null : state.highlightedAsset,
        dialog: closed ? null : state.dialog,
      };
    }

    case 'section-selected':
      return { ...state, section: action.section, surface: surfaceForSection(action.section) };

    case 'mode-selected':
      return { ...state, mode: action.mode };

    case 'mode-toggled':
      return { ...state, mode: state.mode === 'edit' ? 'preview' : 'edit' };

    case 'surface-selected':
      return {
        ...state,
        surface: action.surface,
        // Going back to editing lands on the part of the theme that decides what was on screen.
        section: sectionForSurface(action.surface),
      };

    case 'page-selected':
      return { ...state, selectedPage: Math.max(action.page, 0) };

    case 'asset-highlighted':
      return { ...state, highlightedAsset: action.path };

    case 'pending-changed':
      return { ...state, pending: action.pending };

    case 'dialog-opened':
      return { ...state, dialog: action.dialog, notice: null };

    case 'dialog-closed':
      return { ...state, dialog: null };

    case 'notice-shown':
      return { ...state, notice: action.notice };

    case 'notice-dismissed':
      return { ...state, notice: null };
  }
};

/**
 * What to say about an export.
 *
 * A cancelled export is a decision, not a problem, so it says nothing at all. A blocked one
 * points at the report rather than repeating it: the issues are already on screen, and
 * saying how many there are is what the message can usefully add.
 */
export const exportResultAction = (result: ExportResult): EditorAction => {
  switch (result.status) {
    case 'exported':
      return {
        type: 'notice-shown',
        notice: {
          tone: 'success',
          message: `PS Vita theme exported as “${result.record.name}” — ${String(result.record.fileCount)} files, ${formatByteSize(result.record.totalBytes)}.`,
        },
      };

    case 'cancelled':
      return { type: 'notice-dismissed' };

    case 'blocked':
      return {
        type: 'notice-shown',
        notice: {
          tone: 'error',
          message:
            result.errorCount === 1
              ? 'Export stopped: one problem has to be fixed first.'
              : `Export stopped: ${String(result.errorCount)} problems have to be fixed first.`,
        },
      };

    case 'needs-confirmation':
      return {
        type: 'dialog-opened',
        dialog: { kind: 'confirm-replacement', name: result.name, format: result.format },
      };

    case 'failed':
      return { type: 'notice-shown', notice: { tone: 'error', message: result.message } };
  }
};

/**
 * What to say about a folder of icons that was brought in.
 *
 * Four things can happen to a file in that folder and somebody will want to know which:
 * it went into a slot, its name meant nothing here, two files claimed the same slot, or it
 * was meant for a slot and could not be used. The message says how many of each rather than
 * listing them — the icons themselves are on screen, which is the better answer.
 */
export const iconSetImportResultAction = (result: IconSetImportResult): EditorAction => {
  if (result.status === 'cancelled') {
    return { type: 'notice-dismissed' };
  }

  if (result.status === 'rejected') {
    return { type: 'notice-shown', notice: { tone: 'error', message: result.message } };
  }

  const { applied, ignored, ambiguous, rejected } = result.summary;
  const asides = [
    ignored.length === 0 ? null : `${String(ignored.length)} not recognised`,
    ambiguous.length === 0 ? null : `${String(ambiguous.length)} ambiguous`,
    rejected.length === 0 ? null : `${String(rejected.length)} unusable`,
  ].filter((part): part is string => part !== null);

  if (applied.length === 0) {
    return {
      type: 'notice-shown',
      notice: {
        tone: 'warning',
        message:
          asides.length === 0
            ? 'That folder held no system icons.'
            : `No icons were replaced — ${asides.join(', ')}.`,
      },
    };
  }

  const replaced =
    applied.length === 1 ? 'One icon replaced' : `${String(applied.length)} icons replaced`;
  return {
    type: 'notice-shown',
    notice: {
      tone: asides.length === 0 ? 'success' : 'warning',
      message: asides.length === 0 ? `${replaced}.` : `${replaced} — ${asides.join(', ')}.`,
    },
  };
};

/**
 * What to say about a save.
 *
 * A save that worked needs no announcement: the title stops saying there is unsaved work,
 * which is the answer to the only question somebody had. A save that was called off says
 * nothing at all, and one that failed says why, because the work is still only in memory.
 */
export const projectSaveResultAction = (result: ProjectSaveResult): EditorAction => {
  switch (result.status) {
    case 'saved':
    case 'cancelled':
      return { type: 'notice-dismissed' };
    case 'failed':
      return { type: 'notice-shown', notice: { tone: 'error', message: result.message } };
  }
};

/**
 * What to say about a conversion.
 *
 * What was there and what is there now, in one line: the point of showing it is so somebody
 * can tell at a glance that the picture is now the size and kind the theme wanted.
 */
export const conversionResultAction = (result: ConvertAssetResult): EditorAction => {
  if (result.status === 'rejected') {
    return { type: 'notice-shown', notice: { tone: 'error', message: result.message } };
  }

  const { source, result: converted } = result.report;
  const describe = (media: InspectedAsset['media']): string =>
    media.kind === 'image'
      ? `${media.format.toUpperCase()} ${formatPixels(media.width, media.height)}`
      : 'an unrecognised file';

  return {
    type: 'notice-shown',
    notice: {
      tone: 'success',
      message: `Converted ${describe(source.media)} to ${describe(converted.media)} · ${formatByteSize(converted.byteSize)}.`,
    },
  };
};

/**
 * What to say about drawing previews.
 *
 * Two lists come back and both matter: a theme with no lock screen gets two previews and a
 * reason for the third, and being told only about the two would look like something went
 * wrong. A single refusal says what it says, because the message already explains what to do.
 */
export const previewGenerationResultAction = (result: GeneratePreviewsResult): EditorAction => {
  if (result.status === 'rejected') {
    return { type: 'notice-shown', notice: { tone: 'error', message: result.message } };
  }

  const { generated, refused } = result.summary;
  const firstRefusal = refused[0];

  if (generated.length === 0) {
    return {
      type: 'notice-shown',
      notice: {
        tone: 'warning',
        message: firstRefusal?.message ?? 'There was nothing to draw.',
      },
    };
  }

  const drawn =
    generated.length === 1 ? 'One preview drawn' : `${String(generated.length)} previews drawn`;
  return {
    type: 'notice-shown',
    notice: {
      tone: refused.length === 0 ? 'success' : 'warning',
      message:
        refused.length === 0 || firstRefusal === undefined
          ? `${drawn}.`
          : `${drawn}. ${firstRefusal.message}`,
    },
  };
};

export const themeLoadResultAction = (result: ThemeLoadResult): EditorAction => {
  switch (result.status) {
    case 'loaded':
    case 'cancelled':
      return { type: 'notice-dismissed' };
    case 'failed':
      return { type: 'notice-shown', notice: { tone: 'error', message: result.message } };
  }
};
