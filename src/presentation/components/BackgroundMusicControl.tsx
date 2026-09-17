import type { ReactElement } from 'react';
import type { ThemeSnapshot } from '@/ipc';
import { formatByteSize } from '../format';
import type { EditorActions } from '../state/use-editor';
import { assetDetail } from './primitives';

/** The theme can provide an AT9 or defer music to the console; it cannot force system silence. */
export const BackgroundMusicControl = ({
  theme,
  actions,
}: {
  readonly theme: ThemeSnapshot;
  readonly actions: EditorActions;
}): ReactElement => {
  const path = theme.project.home.backgroundMusic;
  const summary = theme.assets.find((candidate) => candidate.path === path);
  const found = summary?.lookup.status === 'found' ? summary.lookup.asset : null;
  const issues = theme.report.issues.filter((issue) => issue.location === 'home.backgroundMusic');

  return (
    <div className="music-control">
      <div className="music-choices" role="group" aria-label="Background music source">
        <button
          type="button"
          className="music-choice"
          disabled
          title="A theme cannot switch off the PS Vita System Music setting; choose None on the console."
        >
          None · console setting
        </button>
        <button
          type="button"
          className="music-choice"
          aria-pressed={path === null}
          onClick={() => {
            if (path !== null) void actions.clearAsset({ kind: 'backgroundMusic' });
          }}
        >
          Console default
        </button>
        <button
          type="button"
          className="music-choice"
          aria-pressed={path !== null}
          onClick={() => void actions.assignAsset({ kind: 'backgroundMusic' })}
        >
          Custom AT9…
        </button>
      </div>

      {path === null ? (
        <p className="music-explanation">
          No music file is included in this theme. The PS Vita’s System Music setting controls
          whether its own music plays; turn that setting off on the console for no music.
        </p>
      ) : (
        <div className="music-custom">
          <span className="asset-source" data-source="custom">
            Custom
          </span>
          <strong className="asset-path selectable" title={path}>
            {path}
          </strong>
          <span className="dim">
            {found === null
              ? 'File missing or unreadable'
              : `${assetDetail(summary) ?? 'AT9 audio'} · ${formatByteSize(found.byteSize)}`}
          </span>
          <div className="music-actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void actions.assignAsset({ kind: 'backgroundMusic' })}
            >
              Replace…
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => void actions.clearAsset({ kind: 'backgroundMusic' })}
            >
              Clear · use console default
            </button>
          </div>
          {issues.map((issue) => (
            <p
              className="music-issue"
              data-severity={issue.severity}
              key={`${issue.code}:${issue.message}`}
            >
              {issue.message}
            </p>
          ))}
        </div>
      )}

      <p className="music-import-note">
        Choose an existing ATRAC9 .at9 file. WAV, MP3, FLAC and OGG cannot be converted to AT9
        inside VitaTheme; renaming an audio file does not encode it.
      </p>
    </div>
  );
};
