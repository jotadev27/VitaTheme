import type { ReactElement } from 'react';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import { VITA_INFORMATION_BAR_HEIGHT, VITA_SCREEN_WIDTH } from '@/domain/vita/display';
import type { ThemeSnapshot } from '@/ipc';
import { useAssetPreview } from '../components/asset-previews';
import { formatPixels } from '../format';
import { Panel } from '../components/primitives';
import { describeInformationBar, type PreviewImage } from './screen-model';
import { InformationBarStrip } from './ScreenFrame';

/**
 * The information bar, close up.
 *
 * It is 960×32 on the console and that is smaller than a line of text here, so it is shown at
 * twice its size: the point of this surface is the colours and the two badges, which are hard
 * to judge at the size they actually appear.
 */

const BADGE_SPEC = imageAssetSpec('notificationBadge');

const Badge = ({
  image,
  state,
}: {
  readonly image: PreviewImage;
  readonly state: string;
}): ReactElement => {
  const dataUrl = useAssetPreview(image.state === 'ready' ? image.path : null);

  return (
    <div className="badge-preview">
      <div className="badge-preview-circle">
        {dataUrl === null ? (
          <span className="badge-preview-empty">
            {image.state === 'unset' ? 'Not set' : image.state}
          </span>
        ) : (
          // The console masks this image to a circle, so anything outside it is not shown.
          <img src={dataUrl} alt="" />
        )}
      </div>
      <span className="badge-preview-label">{state}</span>
      <span className="badge-preview-size dim">
        {formatPixels(BADGE_SPEC.width, BADGE_SPEC.height)}
      </span>
    </div>
  );
};

export const InformationBarDetail = ({
  theme,
}: {
  readonly theme: ThemeSnapshot;
}): ReactElement => {
  const bar = describeInformationBar(theme);

  return (
    <>
      <Panel
        title="Information bar"
        note={`${formatPixels(VITA_SCREEN_WIDTH, VITA_INFORMATION_BAR_HEIGHT)}, shown at twice its size`}
      >
        <div className="bar-detail">
          <InformationBarStrip bar={bar} />
        </div>
        <p className="field-hint">
          The bar is coloured by the theme rather than drawn by it, which is why wallpapers are
          960×512 and not the full height of the screen. What sits in the bar — the clock, the
          battery, the notification count — belongs to the console, and its arrangement differs
          between models, so it is represented here rather than reproduced.
        </p>
      </Panel>

      <Panel title="Notification badge" note="Masked to a circle by the console">
        <div className="badge-previews">
          <Badge image={bar.noNoticeBadge} state="No notifications" />
          <Badge image={bar.newNoticeBadge} state="Notification waiting" />
        </div>
        <p className="field-hint">
          The console draws the badge slightly past the top and right edges of the screen, so a few
          pixels are clipped, and draws the “no notifications” state a little smaller than the other
          even though both images are the same size.
        </p>
      </Panel>
    </>
  );
};
