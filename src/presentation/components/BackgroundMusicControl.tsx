import { useState, type ReactElement } from 'react';
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
  const [importing, setImporting] = useState(false);
  const chooseMusic = async (): Promise<void> => {
    if (importing) return;
    setImporting(true);
    try {
      await actions.assignAsset({ kind: 'backgroundMusic' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="music-control">
      <div className="music-choices" role="group" aria-label="Background music source">
        <button
          type="button"
          className="music-choice"
          aria-pressed={path === null}
          disabled={importing}
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
          disabled={importing}
          onClick={() => void chooseMusic()}
        >
          {importing ? 'Importing…' : path === null ? 'Choose music…' : 'Replace music…'}
        </button>
      </div>

      {path === null ? (
        <p className="music-explanation">Uses the console’s music setting.</p>
      ) : (
        <div className="music-custom">
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
              className="btn btn-quiet btn-small"
              disabled={importing}
              onClick={() => void actions.clearAsset({ kind: 'backgroundMusic' })}
            >
              Clear
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

      <p className="music-import-note">ATRAC9 (.at9)</p>
    </div>
  );
};
