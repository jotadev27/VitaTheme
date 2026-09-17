import type { ReactElement } from 'react';
import type { RecoveryOffer } from '@/ipc';

/**
 * Work an interrupted session left behind.
 *
 * The choice is put plainly and neither answer is made to look safer than the other: taking
 * the work back does not overwrite the saved project — it opens the recovered work as
 * unsaved, so it is saved only if somebody saves it — and giving it up leaves the saved
 * project exactly as it was.
 */
export const RecoveryDialog = ({
  offer,
  onRecover,
  onDiscard,
}: {
  readonly offer: RecoveryOffer;
  readonly onRecover: () => void;
  readonly onDiscard: () => void;
}): ReactElement => (
  <div className="scrim" role="presentation">
    <div className="dialog" role="alertdialog" aria-labelledby="recovery-title" aria-modal>
      <div className="dialog-head">
        <h2 id="recovery-title">Unsaved work was found</h2>
      </div>

      <div className="dialog-body">
        <p className="dialog-text">
          {offer.kind === 'project'
            ? `VitaTheme kept changes to “${offer.label}” that were never saved. It last stopped without saving them.`
            : 'VitaTheme kept a theme that was being worked on and never saved anywhere.'}
        </p>
        <p className="dialog-text">
          Taking the work back opens it as unsaved, so nothing is written until you save it.
          {offer.kind === 'project' ? ' The saved project is left as it is either way.' : ''}
        </p>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onDiscard}>
          Discard
        </button>
        <button type="button" className="btn btn-primary" onClick={onRecover} autoFocus>
          Recover
        </button>
      </div>
    </div>
  </div>
);
