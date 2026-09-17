import type { ReactElement, ReactNode } from 'react';
import {
  VITA_INFORMATION_BAR_HEIGHT,
  VITA_SCREEN_HEIGHT,
  VITA_SCREEN_WIDTH,
} from '@/domain/vita/display';
import { useAssetPreview } from '../components/asset-previews';
import type { InformationBarPreview, PreviewImage } from './screen-model';

/**
 * A PS Vita screen, drawn at whatever size there is room for.
 *
 * Everything inside is positioned in the console's own pixels: the frame declares itself a
 * container and `--px` is one screen pixel, so a background is 960 wide and the information
 * bar is 32 tall no matter how large the preview is on screen. The geometry is the geometry
 * the format layer documents, not a set of numbers chosen to look right.
 */

export const ScreenFrame = ({
  caption,
  note,
  children,
}: {
  readonly caption: string;
  readonly note?: string | undefined;
  readonly children: ReactNode;
}): ReactElement => (
  <figure className="screen-frame">
    <div
      className="screen"
      style={{ aspectRatio: `${String(VITA_SCREEN_WIDTH)} / ${String(VITA_SCREEN_HEIGHT)}` }}
    >
      {children}
    </div>
    <figcaption className="screen-caption">
      <span>{caption}</span>
      {note === undefined ? null : <span className="dim">{note}</span>}
    </figcaption>
  </figure>
);

/**
 * A file the theme refers to, drawn where it belongs.
 *
 * A slot with nothing in it, or with something the console could not use, says so. Nothing
 * stands in for artwork that was never supplied — a preview that quietly invented a
 * background would be worse than no preview at all.
 */
export const ScreenImage = ({
  image,
  className,
  fit = 'cover',
}: {
  readonly image: PreviewImage;
  readonly className?: string | undefined;
  readonly fit?: 'cover' | 'contain';
}): ReactElement => {
  const dataUrl = useAssetPreview(image.state === 'ready' ? image.path : null);

  if (image.state === 'ready' && dataUrl !== null) {
    return (
      <img
        className={`screen-image ${className ?? ''}`}
        style={{ objectFit: fit }}
        src={dataUrl}
        alt=""
      />
    );
  }

  return (
    <span className={`screen-blank ${className ?? ''}`} data-state={image.state}>
      <span className="screen-blank-label">
        {image.state === 'unset' ? image.label : `${image.label}: ${image.state}`}
      </span>
    </span>
  );
};

const BADGE_LABEL = 'No notifications';

/**
 * The bar across the top of the screen.
 *
 * Its colours are the theme's. What sits in it — the clock, the battery, the notification
 * badge — is the console's own, and Sony's manual says the arrangement differs between
 * models, so what is drawn here stands for those things rather than reproducing them.
 */
export const InformationBarStrip = ({
  bar,
  showBadge = true,
}: {
  readonly bar: InformationBarPreview;
  readonly showBadge?: boolean;
}): ReactElement => {
  const badge = bar.noNoticeBadge.state === 'ready' ? bar.noNoticeBadge : bar.newNoticeBadge;
  const badgeUrl = useAssetPreview(badge.state === 'ready' ? badge.path : null);

  return (
    <div
      className="screen-bar"
      style={{
        height: `calc(${String(VITA_INFORMATION_BAR_HEIGHT)} * var(--px))`,
        background: bar.barColor ?? undefined,
      }}
    >
      <span className="screen-bar-status" style={{ color: bar.indicatorColor ?? undefined }}>
        <span className="screen-bar-glyph" aria-hidden />
        <span className="screen-bar-glyph" aria-hidden />
        <span className="screen-bar-battery" aria-hidden />
      </span>

      <span className="screen-bar-notice" style={{ color: bar.noticeFontColor ?? undefined }}>
        {bar.noticeGlowColor === null ? null : (
          <span className="screen-bar-glow" style={{ background: bar.noticeGlowColor }} />
        )}
      </span>

      {showBadge && badgeUrl !== null ? (
        // The console masks this image to a circle and places it past the top right corner.
        <img className="screen-bar-badge" src={badgeUrl} alt={BADGE_LABEL} />
      ) : null}
    </div>
  );
};
