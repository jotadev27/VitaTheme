import { useEffect, useState, type ReactElement } from 'react';
import type { Notice } from '../state/editor-state';
import { CloseIcon } from './icons';

export const NOTICE_VISIBLE_MS = 5000;
export const NOTICE_FADE_MS = 220;

export const scheduleNoticeDismissal = (
  tone: Notice['tone'],
  fade: () => void,
  dismiss: () => void,
): (() => void) => {
  if (tone === 'error') return () => undefined;
  const fadeTimer = setTimeout(fade, NOTICE_VISIBLE_MS);
  const dismissTimer = setTimeout(dismiss, NOTICE_VISIBLE_MS + NOTICE_FADE_MS);
  return () => {
    clearTimeout(fadeTimer);
    clearTimeout(dismissTimer);
  };
};

export const NoticeToast = ({
  notice,
  onDismiss,
}: {
  readonly notice: Notice;
  readonly onDismiss: () => void;
}): ReactElement => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    return scheduleNoticeDismissal(
      notice.tone,
      () => {
        setFading(true);
      },
      onDismiss,
    );
  }, [notice, onDismiss]);

  return (
    <div className="notice-layer">
      <div
        className="notice"
        data-tone={notice.tone}
        data-fading={fading}
        role={notice.tone === 'error' ? 'alert' : 'status'}
        aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
      >
        <span className="notice-message">{notice.message}</span>
        <button
          type="button"
          className="btn btn-quiet btn-small"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
};
