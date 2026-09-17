import type { ReactElement } from 'react';
import { DATE_LAYOUT_OPTIONS } from '@/domain/vita/start-screen';
import type { ThemeSnapshot } from '@/ipc';
import { describeLockScreen } from './screen-model';
import { InformationBarStrip, ScreenFrame, ScreenImage } from './ScreenFrame';

/**
 * The lock screen.
 *
 * Verified from the format: the wallpaper is 960×512, which leaves the same 32 pixels at the
 * top as the home screen — so the bar is drawn there.
 *
 * **Approximate:** where the clock and the notification panel sit. The three clock positions
 * come from one community source, which the format layer grades `community-reported`, and
 * nothing documents the panel's placement at all. The preview shows the colours, which are
 * the theme's own and are the reason to look at this screen; it says plainly that the
 * placement is not confirmed rather than implying it is.
 */

const CLOCK_TIME = '10:08';
const CLOCK_DATE = 'Saturday, 12 April';
const NOTIFICATION_TITLE = 'Notification';
const NOTIFICATION_BODY = 'How a message looks against this wallpaper.';

const positionLabel = (value: number | null, documented: boolean): string => {
  if (value === null) {
    return 'Clock position not set — the console uses its own default.';
  }

  const option = DATE_LAYOUT_OPTIONS.find((candidate) => candidate.value === value);
  return documented && option !== undefined
    ? `Clock position ${String(value)} (${option.label.toLowerCase()}) — community-reported, not confirmed.`
    : `Clock position ${String(value)} is not a documented value; shown in the default corner.`;
};

export const LockScreen = ({ theme }: { readonly theme: ThemeSnapshot }): ReactElement => {
  const lock = describeLockScreen(theme);

  return (
    <ScreenFrame
      caption="Lock screen"
      note={positionLabel(lock.clock.value, lock.clock.documented)}
    >
      <ScreenImage image={lock.wallpaper} className="screen-wallpaper" />
      <InformationBarStrip bar={lock.informationBar} showBadge={false} />

      <div className="screen-clock" data-corner={lock.clock.corner}>
        <span className="screen-clock-time" style={{ color: lock.clockColor ?? undefined }}>
          {CLOCK_TIME}
        </span>
        <span className="screen-clock-date" style={{ color: lock.clockColor ?? undefined }}>
          {CLOCK_DATE}
        </span>
      </div>

      <div
        className="screen-notification"
        style={{
          background: lock.notification.background ?? undefined,
          borderColor: lock.notification.border ?? undefined,
          color: lock.notification.font ?? undefined,
        }}
      >
        <span className="screen-notification-title">{NOTIFICATION_TITLE}</span>
        <span className="screen-notification-body">{NOTIFICATION_BODY}</span>
      </div>
    </ScreenFrame>
  );
};
