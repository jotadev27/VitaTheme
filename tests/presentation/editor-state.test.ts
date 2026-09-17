import { describe, expect, it } from 'vitest';
import { validationReport } from '@/domain/validation/report';
import type { SessionSnapshot, ThemeSnapshot } from '@/ipc';
import {
  exportResultAction,
  iconSetImportResultAction,
  previewGenerationResultAction,
  initialEditorState,
  editorReducer,
  themeLoadResultAction,
  type EditorState,
} from '@/presentation/state/editor-state';
import { aThemeProject } from '../support/theme-fixtures';

/**
 * What the window decides for itself.
 *
 * The theme is not part of this: it arrives whole from the privileged side. What is tested
 * here is the interface's own memory — where it is looking, what it is waiting for, and what
 * it says about an outcome.
 */

const aThemeSnapshot = (): ThemeSnapshot => ({
  origin: 'folder',
  isDirty: false,
  label: 'Example Theme',
  project: aThemeProject(),
  report: validationReport([]),
  assets: [],
  canUndo: false,
  canRedo: false,
  revision: 1,
  assetRevision: 1,
});

const withTheme = (): SessionSnapshot => ({
  theme: aThemeSnapshot(),
  lastExport: null,
  recovery: null,
  recentProjects: [],
});
const withoutTheme = (): SessionSnapshot => ({
  theme: null,
  lastExport: null,
  recovery: null,
  recentProjects: [],
});

/** One change applied to a session that has a theme open, which most of these need. */
const stateAfter = (action: Parameters<typeof editorReducer>[1]): EditorState =>
  after(initialEditorState, { type: 'session-changed', session: withTheme() }, action);

const after = (
  state: EditorState,
  ...actions: Parameters<typeof editorReducer>[1][]
): EditorState => actions.reduce(editorReducer, state);

describe('editorReducer', () => {
  it('takes the session as it is given, without interpreting it', () => {
    const session = withTheme();

    const state = editorReducer(initialEditorState, { type: 'session-changed', session });

    expect(state.session).toBe(session);
  });

  it('keeps the section in view while a theme stays open', () => {
    const state = after(
      initialEditorState,
      { type: 'session-changed', session: withTheme() },
      { type: 'section-selected', section: 'assets' },
      { type: 'session-changed', session: withTheme() },
    );

    expect(state.section).toBe('assets');
  });

  it('goes back to the overview when the theme is closed', () => {
    const state = after(
      initialEditorState,
      { type: 'session-changed', session: withTheme() },
      { type: 'section-selected', section: 'home' },
      { type: 'asset-highlighted', path: 'bg1.png' },
      { type: 'session-changed', session: withoutTheme() },
    );

    expect(state.section).toBe('overview');
    expect(state.highlightedAsset).toBeNull();
  });

  it('does not leave a dialog open over a theme that is no longer there', () => {
    const state = after(
      initialEditorState,
      { type: 'session-changed', session: withTheme() },
      {
        type: 'dialog-opened',
        dialog: { kind: 'confirm-replacement', name: 'X', format: 'folder' },
      },
      { type: 'session-changed', session: withoutTheme() },
    );

    expect(state.dialog).toBeNull();
  });

  it('clears a notice when a dialog takes over', () => {
    const state = after(
      initialEditorState,
      { type: 'notice-shown', notice: { tone: 'error', message: 'Something went wrong.' } },
      { type: 'dialog-opened', dialog: { kind: 'new-theme' } },
    );

    expect(state.notice).toBeNull();
    expect(state.dialog).toEqual({ kind: 'new-theme' });
  });

  it('remembers what is being waited for', () => {
    const state = editorReducer(initialEditorState, {
      type: 'pending-changed',
      pending: 'exporting',
    });

    expect(state.pending).toBe('exporting');
  });
});

describe('what the window says about an export', () => {
  it('reports what was written', () => {
    const action = exportResultAction({
      status: 'exported',
      record: { format: 'archive', name: 'Midnight.zip', fileCount: 12, totalBytes: 2_621_440 },
    });

    expect(action.type).toBe('notice-shown');
    if (action.type !== 'notice-shown') return;
    expect(action.notice.tone).toBe('success');
    expect(action.notice.message).toContain('Midnight.zip');
    expect(action.notice.message).toContain('12 files');
    expect(action.notice.message).toContain('2.5 MB');
  });

  it('says nothing at all when the export was called off', () => {
    expect(exportResultAction({ status: 'cancelled' })).toEqual({ type: 'notice-dismissed' });
  });

  it('counts the problems rather than repeating them', () => {
    const action = exportResultAction({ status: 'blocked', errorCount: 3 });

    expect(action).toEqual({
      type: 'notice-shown',
      notice: { tone: 'error', message: 'Export stopped: 3 problems have to be fixed first.' },
    });
  });

  it('puts one problem in the singular', () => {
    const action = exportResultAction({ status: 'blocked', errorCount: 1 });

    expect(action.type === 'notice-shown' && action.notice.message).toContain(
      'one problem has to be fixed',
    );
  });

  it('asks rather than announcing when something is already there', () => {
    const action = exportResultAction({
      status: 'needs-confirmation',
      name: 'Midnight',
      format: 'folder',
    });

    expect(action).toEqual({
      type: 'dialog-opened',
      dialog: { kind: 'confirm-replacement', name: 'Midnight', format: 'folder' },
    });
  });

  it('passes a failure on in the words it was given', () => {
    const action = exportResultAction({ status: 'failed', message: 'The folder is read-only.' });

    expect(action).toEqual({
      type: 'notice-shown',
      notice: { tone: 'error', message: 'The folder is read-only.' },
    });
  });
});

describe('what the window says about opening a theme', () => {
  it('says nothing when a theme opened, because the theme itself is the answer', () => {
    expect(themeLoadResultAction({ status: 'loaded' })).toEqual({ type: 'notice-dismissed' });
  });

  it('says nothing when nobody chose anything', () => {
    expect(themeLoadResultAction({ status: 'cancelled' })).toEqual({ type: 'notice-dismissed' });
  });

  it('reports why a theme could not be opened', () => {
    const action = themeLoadResultAction({
      status: 'failed',
      message: 'The folder has no theme.xml, so it is not a PS Vita theme.',
    });

    expect(action).toEqual({
      type: 'notice-shown',
      notice: {
        tone: 'error',
        message: 'The folder has no theme.xml, so it is not a PS Vita theme.',
      },
    });
  });
});

describe('moving between editing and previewing', () => {
  it('starts in the editor', () => {
    expect(initialEditorState.mode).toBe('edit');
  });

  it('switches to the preview and back', () => {
    const previewing = stateAfter({ type: 'mode-selected', mode: 'preview' });

    expect(previewing.mode).toBe('preview');
    expect(editorReducer(previewing, { type: 'mode-selected', mode: 'edit' }).mode).toBe('edit');
  });

  it('toggles, for the menu item that does not know which mode is current', () => {
    const once = stateAfter({ type: 'mode-toggled' });
    const twice = editorReducer(once, { type: 'mode-toggled' });

    expect(once.mode).toBe('preview');
    expect(twice.mode).toBe('edit');
  });

  it('pairs each part of the theme with what previews it', () => {
    expect(stateAfter({ type: 'section-selected', section: 'home' }).surface).toBe('home');
    expect(stateAfter({ type: 'section-selected', section: 'start-screen' }).surface).toBe(
      'lock-screen',
    );
    expect(stateAfter({ type: 'section-selected', section: 'information-bar' }).surface).toBe(
      'information-bar',
    );
    expect(stateAfter({ type: 'section-selected', section: 'overview' }).surface).toBe(
      'theme-list',
    );
  });

  it('goes back to the part of the theme that decides what was being previewed', () => {
    expect(stateAfter({ type: 'surface-selected', surface: 'lock-screen' }).section).toBe(
      'start-screen',
    );
    expect(stateAfter({ type: 'surface-selected', surface: 'home' }).section).toBe('home');
  });

  it('returns to the editor when the theme is closed', () => {
    const state = after(
      initialEditorState,
      { type: 'session-changed', session: withTheme() },
      { type: 'mode-selected', mode: 'preview' },
      { type: 'session-changed', session: withoutTheme() },
    );

    expect(state.mode).toBe('edit');
  });
});

describe('the page being worked on', () => {
  it('is shared, so the editor and the preview are never on different pages', () => {
    const state = stateAfter({ type: 'page-selected', page: 2 });

    expect(state.selectedPage).toBe(2);
  });

  it('never goes before the first page', () => {
    expect(stateAfter({ type: 'page-selected', page: -3 }).selectedPage).toBe(0);
  });

  it('comes back into range when the page it was on is removed', () => {
    const state = after(
      initialEditorState,
      { type: 'session-changed', session: withTheme() },
      { type: 'page-selected', page: 4 },
      // The theme now has one page; the selection cannot stay on the fifth.
      { type: 'session-changed', session: withTheme() },
    );

    expect(state.selectedPage).toBe(0);
  });

  it('is nothing at all when no theme is open', () => {
    const state = after(
      initialEditorState,
      { type: 'session-changed', session: withTheme() },
      { type: 'page-selected', page: 3 },
      { type: 'session-changed', session: withoutTheme() },
    );

    expect(state.selectedPage).toBe(0);
  });
});

describe('what is said about a folder of icons', () => {
  const imported = (summary: {
    applied?: { slot: 'browser'; name: string }[];
    ignored?: string[];
    ambiguous?: string[];
    rejected?: { name: string; reason: string }[];
  }) =>
    iconSetImportResultAction({
      status: 'imported',
      summary: {
        applied: summary.applied ?? [],
        ignored: summary.ignored ?? [],
        ambiguous: summary.ambiguous ?? [],
        rejected: summary.rejected ?? [],
      },
    });

  it('counts what went in when everything did', () => {
    const action = imported({ applied: [{ slot: 'browser', name: 'icon_web.png' }] });

    expect(action).toEqual({
      type: 'notice-shown',
      notice: { tone: 'success', message: 'One icon replaced.' },
    });
  });

  it('says what was left out, and warns rather than celebrating', () => {
    const action = imported({
      applied: [{ slot: 'browser', name: 'icon_web.png' }],
      ignored: ['holiday.png', 'notes.txt'],
      rejected: [{ name: 'icon_power.png', reason: 'too large' }],
    });

    expect(action).toEqual({
      type: 'notice-shown',
      notice: {
        tone: 'warning',
        message: 'One icon replaced — 2 not recognised, 1 unusable.',
      },
    });
  });

  it('says plainly when a folder held no icons', () => {
    expect(imported({})).toEqual({
      type: 'notice-shown',
      notice: { tone: 'warning', message: 'That folder held no system icons.' },
    });
  });

  it('says nothing when the dialog was dismissed', () => {
    expect(iconSetImportResultAction({ status: 'cancelled' })).toEqual({
      type: 'notice-dismissed',
    });
  });

  it('passes on a refusal as it was given', () => {
    expect(iconSetImportResultAction({ status: 'rejected', message: 'No theme is open.' })).toEqual(
      {
        type: 'notice-shown',
        notice: { tone: 'error', message: 'No theme is open.' },
      },
    );
  });
});

describe('what is said about previews that were drawn', () => {
  const anImage = {
    byteSize: 40_000,
    media: {
      kind: 'image',
      format: 'png',
      width: 480,
      height: 272,
      encoding: { bitDepth: 8, colorModel: 'indexed', hasTransparency: false },
    },
  } as const;

  it('says how many were drawn', () => {
    expect(
      previewGenerationResultAction({
        status: 'generated',
        summary: {
          generated: [
            { kind: 'homePreview', result: anImage },
            { kind: 'packageThumbnail', result: anImage },
          ],
          refused: [],
        },
      }),
    ).toEqual({
      type: 'notice-shown',
      notice: { tone: 'success', message: '2 previews drawn.' },
    });
  });

  it('counts one as one', () => {
    expect(
      previewGenerationResultAction({
        status: 'generated',
        summary: { generated: [{ kind: 'homePreview', result: anImage }], refused: [] },
      }),
    ).toEqual({
      type: 'notice-shown',
      notice: { tone: 'success', message: 'One preview drawn.' },
    });
  });

  it('says what could not be drawn alongside what was', () => {
    expect(
      previewGenerationResultAction({
        status: 'generated',
        summary: {
          generated: [{ kind: 'homePreview', result: anImage }],
          refused: [{ kind: 'startScreenPreview', message: 'Add a lock screen wallpaper first.' }],
        },
      }),
    ).toEqual({
      type: 'notice-shown',
      notice: {
        tone: 'warning',
        message: 'One preview drawn. Add a lock screen wallpaper first.',
      },
    });
  });

  it('gives the reason on its own when nothing could be drawn', () => {
    expect(
      previewGenerationResultAction({
        status: 'generated',
        summary: {
          generated: [],
          refused: [{ kind: 'homePreview', message: 'Give that page a background first.' }],
        },
      }),
    ).toEqual({
      type: 'notice-shown',
      notice: { tone: 'warning', message: 'Give that page a background first.' },
    });
  });

  it('passes on a refusal as it was given', () => {
    expect(
      previewGenerationResultAction({ status: 'rejected', message: 'No theme is open.' }),
    ).toEqual({
      type: 'notice-shown',
      notice: { tone: 'error', message: 'No theme is open.' },
    });
  });
});
