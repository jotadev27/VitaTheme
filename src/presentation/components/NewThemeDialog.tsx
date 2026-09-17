import { useState, type ReactElement, type SyntheticEvent } from 'react';
import type { StartDraftRequest } from '@/ipc';

/**
 * Starting a theme.
 *
 * Only the two fields the console actually shows in its theme list are asked for, and only
 * the name is required — by the validator, which reports a theme without one. Everything
 * else a theme can carry is left for the editor, which is where it belongs.
 */
export const NewThemeDialog = ({
  onCancel,
  onCreate,
}: {
  readonly onCancel: () => void;
  readonly onCreate: (request: StartDraftRequest) => void;
}): ReactElement => {
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    onCreate({ title: title.trim(), provider: provider.trim() });
  };

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <form className="dialog" onSubmit={submit} aria-labelledby="new-theme-title">
        <div className="dialog-head">
          <h2 id="new-theme-title">New theme</h2>
        </div>

        <div className="dialog-body">
          <label className="field">
            <span className="field-label">Theme name</span>
            <input
              className="field-input"
              value={title}
              autoFocus
              maxLength={200}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              placeholder="Shown in the console's theme list"
            />
          </label>

          <label className="field">
            <span className="field-label">Author</span>
            <input
              className="field-input"
              value={provider}
              maxLength={200}
              onChange={(event) => {
                setProvider(event.target.value);
              }}
              placeholder="Shown next to the theme name"
            />
          </label>

          <p className="field-hint">
            A new theme starts with one empty LiveArea page. Save a .vitatheme project to keep
            editing it; export a folder or ZIP when it is ready for the PS Vita.
          </p>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={title.trim().length === 0}>
            Create theme
          </button>
        </div>
      </form>
    </div>
  );
};
