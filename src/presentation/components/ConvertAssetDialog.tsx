import { useState, type ReactElement } from 'react';
import {
  DEFAULT_IMAGE_FIT,
  imageConversionTarget,
  type ImageFit,
} from '@/domain/editing/image-conversion';
import { assetSlotUsage, type ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type { ImageColorModel, MediaDescriptor } from '@/domain/model/media';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import { formatPixels } from '../format';

/**
 * Turning a picture into one the theme can use.
 *
 * Written for somebody who has a picture they like, not for somebody who knows what a colour
 * type is: what they have, what the theme needs, and what converting will do to it, in that
 * order. The technical words are still there — an author who knows them should see them —
 * but nothing depends on understanding them.
 */

const COLOR_MODELS: Readonly<Record<ImageColorModel, string>> = {
  indexed: 'a palette of up to 256 colours',
  'truecolor-alpha': 'full colour with transparency',
  truecolor: 'full colour',
  'grayscale-alpha': 'grey with transparency',
  grayscale: 'grey',
};

const FIT_CHOICES: readonly {
  readonly fit: ImageFit;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    fit: 'cover',
    label: 'Fill the slot',
    hint: 'Keeps the proportions and crops whatever hangs over the edges.',
  },
  {
    fit: 'contain',
    label: 'Fit the whole picture',
    hint: 'Keeps the proportions and fills the rest with black.',
  },
  {
    fit: 'stretch',
    label: 'Stretch to fit',
    hint: 'Uses every pixel of the picture, and distorts it to the required shape.',
  },
];

const describeSource = (media: MediaDescriptor | null): string => {
  if (media?.kind !== 'image') {
    return 'This file is not a picture this application can read.';
  }

  const encoding = media.encoding === null ? null : COLOR_MODELS[media.encoding.colorModel];

  return `${media.format.toUpperCase()}, ${formatPixels(media.width, media.height)}${
    encoding === null ? '' : `, ${encoding}`
  }`;
};

export const ConvertAssetDialog = ({
  slot,
  label,
  media,
  busy,
  onCancel,
  onConvert,
}: {
  readonly slot: ThemeAssetSlot;
  readonly label: string;
  readonly media: MediaDescriptor | null;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConvert: (fit: ImageFit) => void;
}): ReactElement => {
  const [fit, setFit] = useState<ImageFit>(DEFAULT_IMAGE_FIT);
  const usage = assetSlotUsage(slot);
  const spec = usage === 'backgroundMusic' ? null : imageAssetSpec(usage);
  const target = usage === 'backgroundMusic' ? null : imageConversionTarget(usage);

  const sameShape =
    media?.kind === 'image' && target !== null
      ? media.width === target.width && media.height === target.height
      : false;

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div className="dialog dialog-wide" role="dialog" aria-labelledby="convert-title" aria-modal>
        <div className="dialog-head">
          <h2 id="convert-title">Convert “{label}”</h2>
        </div>

        <div className="dialog-body">
          <dl className="convert-compare">
            <dt>What you have</dt>
            <dd>{describeSource(media)}</dd>
            <dt>What this slot takes</dt>
            <dd>
              {target === null || spec === null
                ? 'A sound file, which cannot be converted here.'
                : `PNG, ${formatPixels(target.width, target.height)}, ${COLOR_MODELS[target.colorModel]}`}
            </dd>
          </dl>

          {sameShape ? null : (
            <fieldset className="convert-fits">
              <legend className="convert-fits-legend">
                The picture is not this shape. How should it fit?
              </legend>
              {FIT_CHOICES.map((choice) => (
                <label key={choice.fit} className="convert-fit">
                  <input
                    type="radio"
                    name="convert-fit"
                    value={choice.fit}
                    checked={fit === choice.fit}
                    disabled={busy}
                    onChange={() => {
                      setFit(choice.fit);
                    }}
                  />
                  <span className="convert-fit-label">{choice.label}</span>
                  <span className="convert-fit-hint">{choice.hint}</span>
                </label>
              ))}
            </fieldset>
          )}

          <p className="dialog-text">
            {target?.colorModel === 'indexed'
              ? 'Converting resizes the picture and reduces its colours to a palette, which is how theme backgrounds are normally stored. Some colours will shift slightly.'
              : 'Converting resizes the picture and keeps its transparency.'}{' '}
            The file you chose is not modified, and this is one change you can take back.
          </p>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || target === null}
            onClick={() => {
              onConvert(fit);
            }}
          >
            {busy ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  );
};
