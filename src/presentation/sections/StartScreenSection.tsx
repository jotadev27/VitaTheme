import type { ReactElement } from 'react';
import { DATE_LAYOUT_CONFIDENCE, DATE_LAYOUT_OPTIONS } from '@/domain/vita/start-screen';
import type { ThemeSnapshot } from '@/ipc';
import { AssetSlotControl } from '../components/AssetSlotControl';
import { ChoiceField, ColorField, type ChoiceOption } from '../components/fields';
import { Panel } from '../components/primitives';
import type { EditorActions } from '../state/use-editor';

/**
 * The lock screen: the wallpaper, the clock, and the panel notifications arrive in.
 *
 * The clock positions offered are the ones the community has documented, and where a theme
 * uses something else it is kept and offered back — a single unconfirmed source is not
 * grounds for rewriting somebody's theme.
 */

const UNSET = 'unset';

const layoutOptions = (value: number | null): readonly ChoiceOption<string>[] => {
  const documented = DATE_LAYOUT_OPTIONS.map((option) => ({
    value: String(option.value),
    label: option.label,
  }));

  const known = documented.some((option) => option.value === String(value));

  return [
    { value: UNSET, label: 'Not set' },
    ...documented,
    ...(value === null || known
      ? []
      : [{ value: String(value), label: `Position ${String(value)} — not a documented value` }]),
  ];
};

export const StartScreenSection = ({
  theme,
  actions,
}: {
  readonly theme: ThemeSnapshot;
  readonly actions: EditorActions;
}): ReactElement => {
  const { startScreen } = theme.project;

  const setColor =
    (
      slot:
        | 'dateColor'
        | 'notificationBackgroundColor'
        | 'notificationBorderColor'
        | 'notificationFontColor',
    ) =>
    (value: string | null): void => {
      void actions.applyEdit({ kind: 'set-color', slot: { kind: slot }, value });
    };

  return (
    <>
      <Panel title="Wallpaper">
        <div className="slot-list">
          <AssetSlotControl
            label="Lock screen image"
            slot={{ kind: 'startScreenBackground' }}
            path={startScreen.background}
            assets={theme.assets}
            onAssign={(slot) => void actions.assignAsset(slot)}
            onClear={(slot) => void actions.clearAsset(slot)}
            onConvert={actions.beginConversion}
            onDrop={(target, file) => void actions.dropAsset(target, file)}
          />
        </div>
      </Panel>

      <Panel title="Clock">
        <div className="field-grid">
          <ColorField
            label="Clock and date colour"
            value={startScreen.dateColor}
            onCommit={setColor('dateColor')}
          />
          <ChoiceField
            label="Clock position"
            value={startScreen.dateLayout === null ? UNSET : String(startScreen.dateLayout)}
            options={layoutOptions(startScreen.dateLayout)}
            hint={
              DATE_LAYOUT_CONFIDENCE === 'community-reported'
                ? 'These positions come from a single community source and are not confirmed.'
                : undefined
            }
            onCommit={(value) => {
              void actions.applyEdit({
                kind: 'set-date-layout',
                value: value === UNSET ? null : Number.parseInt(value, 10),
              });
            }}
          />
        </div>
      </Panel>

      <Panel title="Notifications">
        <div className="field-grid">
          <ColorField
            label="Panel background"
            value={startScreen.notificationBackgroundColor}
            onCommit={setColor('notificationBackgroundColor')}
          />
          <ColorField
            label="Panel border"
            value={startScreen.notificationBorderColor}
            onCommit={setColor('notificationBorderColor')}
          />
          <ColorField
            label="Notification text"
            value={startScreen.notificationFontColor}
            onCommit={setColor('notificationFontColor')}
          />
        </div>
      </Panel>
    </>
  );
};
