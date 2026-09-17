import type { ReactElement } from 'react';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import type { ThemeSnapshot } from '@/ipc';
import { SystemIconArtwork } from '../assets/system-icon-artwork';
import { useAssetPreview } from '../components/asset-previews';
import { formatCount } from '../format';
import { describeHomeScreen, type PreviewBubble, type PreviewImage } from './screen-model';
import { InformationBarStrip, ScreenFrame, ScreenImage } from './ScreenFrame';

/**
 * The home screen, as one of its LiveArea pages.
 *
 * Verified from the format: the screen is 960×544, the information bar takes the top 32
 * pixels, a wallpaper is 960×512, an icon is 128×128 and a page dot is 22×22 — so all of
 * those are drawn at their real size.
 *
 * **Approximate:** where the icons sit. Sony's manual documents neither how many bubbles a
 * page holds nor how they are arranged, and the arrangement is the console's rather than the
 * theme's. The grid below is a stand-in for that, which is why it says so on screen. What it
 * is actually for is the part the theme *does* decide: whether the labels can be read against
 * this background, whether the icons suit it, and whether the bar colour belongs to it.
 */

const ICON_SIZE = imageAssetSpec('appIcon').width;
const PAGE_DOT_SIZE = imageAssetSpec('pageIndicator').width;

const Bubble = ({
  bubble,
  labelColor,
  labelShadow,
}: {
  readonly bubble: PreviewBubble;
  readonly labelColor: string | null;
  readonly labelShadow: boolean;
}): ReactElement => {
  const dataUrl = useAssetPreview(bubble.icon.state === 'ready' ? bubble.icon.path : null);

  return (
    <li className="screen-bubble">
      <span
        className="screen-bubble-icon"
        data-themed={dataUrl !== null}
        style={{
          width: `calc(${String(ICON_SIZE)} * var(--px))`,
          height: `calc(${String(ICON_SIZE)} * var(--px))`,
        }}
      >
        {dataUrl === null ? (
          // Not themed: the console draws its own icon here, and this stands for it.
          <SystemIconArtwork slot={bubble.slot} />
        ) : (
          <img src={dataUrl} alt="" />
        )}
      </span>
      <span
        className="screen-bubble-label"
        style={{
          color: labelColor ?? undefined,
          // `m_fontShadow` is community-reported; drawn as a plain drop shadow.
          textShadow: labelShadow ? '0 calc(1.5 * var(--px)) calc(2 * var(--px)) #000' : 'none',
        }}
      >
        {bubble.label}
      </span>
    </li>
  );
};

const PageDots = ({
  count,
  current,
  base,
  currentImage,
}: {
  readonly count: number;
  readonly current: number;
  readonly base: PreviewImage;
  readonly currentImage: PreviewImage;
}): ReactElement => {
  const baseUrl = useAssetPreview(base.state === 'ready' ? base.path : null);
  const currentUrl = useAssetPreview(currentImage.state === 'ready' ? currentImage.path : null);
  const size = `calc(${String(PAGE_DOT_SIZE)} * var(--px))`;

  return (
    <div className="screen-dots" aria-hidden>
      {Array.from({ length: count }, (_unused, index) => {
        const url = index === current ? currentUrl : baseUrl;
        return url === null ? (
          <span
            key={index}
            className="screen-dot"
            data-current={index === current}
            style={{ width: size, height: size }}
          />
        ) : (
          <img key={index} src={url} alt="" style={{ width: size, height: size }} />
        );
      })}
    </div>
  );
};

export const HomeScreen = ({
  theme,
  page,
}: {
  readonly theme: ThemeSnapshot;
  readonly page: number;
}): ReactElement => {
  const home = describeHomeScreen(theme, page);

  return (
    <ScreenFrame
      caption={`Home screen — LiveArea page ${String(home.page + 1)} of ${String(home.pageCount)}`}
      note="Icon arrangement is an approximation; the console decides it, not the theme."
    >
      <ScreenImage image={home.background} className="screen-wallpaper" />
      <InformationBarStrip bar={home.informationBar} />

      <ul className="screen-bubbles">
        {home.bubbles.map((bubble) => (
          <Bubble
            key={bubble.slot}
            bubble={bubble}
            labelColor={home.labelColor}
            labelShadow={home.labelShadow}
          />
        ))}
      </ul>

      <PageDots
        count={Math.max(home.pageCount, 1)}
        current={home.page}
        base={home.pageIndicator}
        currentImage={home.currentPageIndicator}
      />

      {home.hasBackgroundMusic ? (
        <span className="screen-music" title="This theme plays background music">
          ♪ {formatCount(1, 'track')}
        </span>
      ) : null}
    </ScreenFrame>
  );
};
