import type { ReactElement } from 'react';
import { VITA_INFORMATION_BAR_HEIGHT, VITA_SCREEN_WIDTH } from '@/domain/vita/display';
import type { ThemeSnapshot } from '@/ipc';
import { AssetSlotControl } from '../components/AssetSlotControl';
import { ColorField } from '../components/fields';
import { Panel } from '../components/primitives';
import { formatPixels } from '../format';
import type { EditorActions } from '../state/use-editor';

/**
 * The bar across the top of the screen. It is coloured rather than drawn, which is why a
 * theme's wallpapers are shorter than the screen is tall.
 */
export const InformationBarSection = ({
  theme,
  actions,
}: {
  readonly theme: ThemeSnapshot;
  readonly actions: EditorActions;
}): ReactElement => {
  const { informationBar } = theme.project;

  const setColor =
    (slot: 'barColor' | 'indicatorColor' | 'noticeFontColor' | 'noticeGlowColor') =>
    (value: string | null): void => {
      void actions.applyEdit({ kind: 'set-color', slot: { kind: slot }, value });
    };

  return (
    <>
      <Panel
        title="Colours"
        note={`${formatPixels(VITA_SCREEN_WIDTH, VITA_INFORMATION_BAR_HEIGHT)} strip across the top`}
      >
        <div className="field-grid">
          <ColorField label="Bar" value={informationBar.barColor} onCommit={setColor('barColor')} />
          <ColorField
            label="Status icons"
            value={informationBar.indicatorColor}
            onCommit={setColor('indicatorColor')}
          />
          <ColorField
            label="Notification text"
            value={informationBar.noticeFontColor}
            onCommit={setColor('noticeFontColor')}
          />
          <ColorField
            label="Notification glow"
            value={informationBar.noticeGlowColor}
            onCommit={setColor('noticeGlowColor')}
          />
        </div>
      </Panel>

      <Panel title="Notification badge" note="Masked to a circle by the console">
        <div className="slot-list">
          <AssetSlotControl
            label="No notifications"
            slot={{ kind: 'noNoticeBadge' }}
            path={informationBar.noNoticeIcon}
            assets={theme.assets}
            onAssign={(slot) => void actions.assignAsset(slot)}
            onClear={(slot) => void actions.clearAsset(slot)}
            onConvert={actions.beginConversion}
            onDrop={(target, file) => void actions.dropAsset(target, file)}
          />
          <AssetSlotControl
            label="Notification waiting"
            slot={{ kind: 'newNoticeBadge' }}
            path={informationBar.newNoticeIcon}
            assets={theme.assets}
            onAssign={(slot) => void actions.assignAsset(slot)}
            onClear={(slot) => void actions.clearAsset(slot)}
            onConvert={actions.beginConversion}
            onDrop={(target, file) => void actions.dropAsset(target, file)}
          />
        </div>
      </Panel>
    </>
  );
};
