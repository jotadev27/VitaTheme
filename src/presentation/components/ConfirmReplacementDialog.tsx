import type { ReactElement } from 'react';
import type { ExportFormat } from '@/ipc';

/**
 * Consent before anything is overwritten.
 *
 * The export itself refuses to replace what it did not put there, and reports back instead.
 * This is where that refusal is turned into a question, and it says plainly what replacing
 * costs: the previous contents, not merely the name.
 */
export const ConfirmReplacementDialog = ({
  name,
  format,
  onCancel,
  onConfirm,
}: {
  readonly name: string;
  readonly format: ExportFormat;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): ReactElement => (
  <div
    className="scrim"
    role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    }}
  >
    <div className="dialog" role="alertdialog" aria-labelledby="replace-title" aria-modal>
      <div className="dialog-head">
        <h2 id="replace-title">Replace “{name}”?</h2>
      </div>

      <div className="dialog-body">
        <p className="dialog-text">
          {format === 'folder'
            ? `A folder named “${name}” is already there. Replacing it removes everything currently inside it.`
            : `A file named “${name}” is already there. Replacing it discards the existing archive.`}
        </p>
        <p className="dialog-text">
          The new export is written beside it first and only moved into place once it is complete,
          so a failure leaves what is there now untouched.
        </p>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Replace
        </button>
      </div>
    </div>
  </div>
);
