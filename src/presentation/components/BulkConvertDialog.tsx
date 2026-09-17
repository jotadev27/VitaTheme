import { useState, type ReactElement } from 'react';
import { incompatibleImageSlots } from '@/domain/editing/bulk-image-conversion';
import { assetAtSlot, assetSlotUsage } from '@/domain/editing/theme-asset-slot';
import { imageConversionTarget } from '@/domain/editing/image-conversion';
import type { ThemeSnapshot } from '@/ipc';
import { formatPixels } from '../format';

const labelOf = (kind: string): string => kind.replace(/([A-Z])/g, ' $1').toLowerCase();

export const BulkConvertDialog = ({
  theme,
  busy,
  onCancel,
  onConvert,
}: {
  readonly theme: ThemeSnapshot;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConvert: (fit: 'cover' | 'contain') => void;
}): ReactElement => {
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const slots = incompatibleImageSlots(theme.project, theme.assets);

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-labelledby="bulk-convert-title"
        aria-modal
      >
        <div className="dialog-head">
          <h2 id="bulk-convert-title">Convert incompatible images</h2>
        </div>
        <div className="dialog-body">
          <p className="dialog-text">
            {String(slots.length)} occupied image slot{slots.length === 1 ? '' : 's'} can be
            converted to the required PNG size and encoding. Source files are never modified. All
            conversions form one undoable change.
          </p>
          <ul className="bulk-convert-list">
            {slots.map((slot, index) => {
              const path = assetAtSlot(theme.project, slot);
              const summary = theme.assets.find((asset) => asset.path === path);
              const media = summary?.lookup.status === 'found' ? summary.lookup.asset.media : null;
              const usage = assetSlotUsage(slot);
              if (usage === 'backgroundMusic') return null;
              const target = imageConversionTarget(usage);
              const label =
                slot.kind === 'appIcon'
                  ? `${slot.application} icon`
                  : slot.kind === 'liveAreaBackground' || slot.kind === 'liveAreaThumbnail'
                    ? `Page ${String(slot.page + 1)} ${labelOf(slot.kind)}`
                    : labelOf(slot.kind);
              return (
                <li key={`${slot.kind}:${String(index)}`}>
                  <strong>{label}</strong>
                  <span>
                    {media?.kind === 'image'
                      ? `${media.format.toUpperCase()} · ${formatPixels(media.width, media.height)}`
                      : path}
                  </span>
                  <span>→ PNG · {formatPixels(target.width, target.height)}</span>
                </li>
              );
            })}
          </ul>
          <fieldset className="convert-fits">
            <legend className="convert-fits-legend">
              How should differently shaped pictures fit?
            </legend>
            <label className="convert-fit">
              <input
                type="radio"
                name="bulk-fit"
                checked={fit === 'cover'}
                disabled={busy}
                onChange={() => {
                  setFit('cover');
                }}
              />
              <span className="convert-fit-label">Fill and crop</span>
              <span className="convert-fit-hint">Keeps proportions; edges may be cropped.</span>
            </label>
            <label className="convert-fit">
              <input
                type="radio"
                name="bulk-fit"
                checked={fit === 'contain'}
                disabled={busy}
                onChange={() => {
                  setFit('contain');
                }}
              />
              <span className="convert-fit-label">Fit and pad</span>
              <span className="convert-fit-hint">
                Keeps the whole picture; adds black where needed.
              </span>
            </label>
          </fieldset>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || slots.length === 0}
            onClick={() => {
              onConvert(fit);
            }}
          >
            {busy
              ? 'Converting…'
              : `Convert ${String(slots.length)} image${slots.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
