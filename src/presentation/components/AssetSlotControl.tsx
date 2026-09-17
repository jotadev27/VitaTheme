import { useState, type DragEvent, type ReactElement, type ReactNode } from 'react';
import {
  imageConversionTarget,
  imageConversionWouldChange,
} from '@/domain/editing/image-conversion';
import { assetSlotUsage, type ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type { ThemeAssetSummary } from '@/domain/validation/asset-inventory';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import { REQUIRED_AUDIO_EXTENSION } from '@/domain/vita/audio';
import { formatByteSize, formatPixels } from '../format';
import { useAssetPreview } from './asset-previews';
import { assetDetail, assetState } from './primitives';

/**
 * A place in the theme where a file goes, and what is in it.
 *
 * This is the whole of how artwork enters a theme: the slot is named, the privileged side
 * opens the dialog, examines what was chosen and puts it in place. The window never handles
 * a location — it asks for a slot to be filled and is shown what the theme looks like
 * afterwards.
 */

const expectedOf = (slot: ThemeAssetSlot): string => {
  const usage = assetSlotUsage(slot);
  if (usage === 'backgroundMusic') {
    return `ATRAC9 audio (${REQUIRED_AUDIO_EXTENSION})`;
  }

  const spec = imageAssetSpec(usage);
  return `Target ${formatPixels(spec.width, spec.height)} PNG · imports PNG, JPEG, BMP or GIF`;
};

/**
 * What a slot shows when the theme leaves it alone.
 *
 * Only some slots have one: a system icon the theme does not replace is drawn by the
 * console, so the slot stands for something rather than being empty. A wallpaper has no
 * such thing — a theme without one has no wallpaper.
 */
export interface BuiltInDefault {
  readonly artwork: ReactElement;
  /** One line saying what the console does with this slot when the theme says nothing. */
  readonly summary: string;
}

/**
 * A slot VitaTheme can fill by itself, and whether it has.
 *
 * The badge tells somebody whether VitaTheme drew a picture or they supplied it.
 */
export interface SlotGeneration {
  /** True when what is in the slot was drawn by VitaTheme rather than supplied. */
  readonly isGenerated: boolean;
  readonly onGenerate: (slot: ThemeAssetSlot) => void;
  readonly busy: boolean;
}

export const AssetSlotControl = ({
  label,
  slot,
  path,
  assets,
  onAssign,
  onClear,
  onConvert,
  onDrop,
  builtInDefault,
  generation,
  compact = false,
  featured = false,
  footer,
}: {
  readonly label: string;
  readonly slot: ThemeAssetSlot;
  readonly path: string | null;
  readonly assets: readonly ThemeAssetSummary[];
  readonly onAssign: (slot: ThemeAssetSlot) => void;
  readonly onClear: (slot: ThemeAssetSlot) => void;
  readonly onConvert: (slot: ThemeAssetSlot, label: string) => void;
  readonly onDrop: (slot: ThemeAssetSlot, file: File) => void;
  readonly builtInDefault?: BuiltInDefault | undefined;
  readonly generation?: SlotGeneration | undefined;
  readonly compact?: boolean | undefined;
  readonly featured?: boolean | undefined;
  readonly footer?: ReactNode;
}): ReactElement => {
  const summary = assets.find((candidate) => candidate.path === path);
  const state = path === null ? 'empty' : assetState(summary);
  const preview = useAssetPreview(path);
  const detail = assetDetail(summary);
  const usage = assetSlotUsage(slot);
  const compactDefaultHint =
    usage === 'backgroundMusic'
      ? expectedOf(slot)
      : `${formatPixels(imageAssetSpec(usage).width, imageAssetSpec(usage).height)} PNG when replaced`;

  /**
   * Offered only when it would do something.
   *
   * What the slot needs comes from the format layer, so this asks the same question the
   * validator is answering elsewhere on the screen rather than deciding one of its own.
   */
  const convertible =
    usage !== 'backgroundMusic' &&
    summary?.lookup.status === 'found' &&
    summary.lookup.asset.media.kind === 'image' &&
    imageConversionWouldChange(imageConversionTarget(usage), summary.lookup.asset.media);

  const [dragging, setDragging] = useState<'welcome' | 'unwelcome' | null>(null);

  /**
   * What the drop would be, as far as anything can tell before it happens.
   *
   * The kind the system reports while a file is over the window is a hint and is treated as
   * one: it decides how the slot looks, and nothing else. What the file actually is gets
   * decided on the other side of the bridge, by reading its bytes.
   */
  const wouldWelcome = (event: DragEvent): boolean => {
    const dragged = [...event.dataTransfer.items].filter((item) => item.kind === 'file');
    if (dragged.length !== 1) {
      return false;
    }

    const type = dragged[0]?.type ?? '';
    const wants = usage === 'backgroundMusic' ? 'audio/' : 'image/';
    // An empty type means the system did not say; that is not a reason to refuse it.
    return type === '' || type.startsWith(wants);
  };

  const onDragOver = (event: DragEvent): void => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
      const welcome = wouldWelcome(event);
      event.dataTransfer.dropEffect = welcome ? 'copy' : 'none';
      setDragging(welcome ? 'welcome' : 'unwelcome');
    }
  };

  const onDropped = (event: DragEvent): void => {
    event.preventDefault();
    setDragging(null);

    const file = event.dataTransfer.files[0];
    if (file !== undefined && event.dataTransfer.files.length === 1) {
      onDrop(slot, file);
    }
  };

  return (
    <div
      className={
        compact
          ? 'asset-slot asset-slot-compact'
          : featured
            ? 'asset-slot asset-slot-featured'
            : 'asset-slot'
      }
      data-state={state}
      data-dragging={dragging ?? undefined}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={() => {
        setDragging(null);
      }}
      onDrop={onDropped}
    >
      {dragging === null ? null : (
        <span className="asset-slot-drop" aria-hidden>
          {dragging === 'welcome' ? 'Drop to use' : 'Not for this slot'}
        </span>
      )}

      <div className="asset-slot-preview" aria-hidden>
        {preview !== null ? (
          <img className="asset-slot-image" src={preview} alt="" draggable={false} />
        ) : state === 'empty' && builtInDefault !== undefined ? (
          <span className="asset-slot-default">{builtInDefault.artwork}</span>
        ) : (
          <span className="asset-slot-placeholder">{state === 'empty' ? '—' : '?'}</span>
        )}
      </div>

      <div className="asset-slot-body">
        <div className="asset-slot-head">
          <span className="asset-slot-label">{label}</span>
          <span className="asset-slot-status">
            {builtInDefault === undefined ? null : (
              <span className="asset-source" data-source={path === null ? 'default' : 'custom'}>
                {path === null ? 'Console default' : 'Custom'}
              </span>
            )}
            {generation === undefined || path === null ? null : (
              <span
                className="asset-source"
                data-source={generation.isGenerated ? 'generated' : 'custom'}
              >
                {generation.isGenerated ? 'Generated' : 'Custom'}
              </span>
            )}
            {state === 'missing' || state === 'unreadable' ? (
              <span className="asset-dot" data-state={state} />
            ) : null}
          </span>
        </div>

        <div className="asset-slot-details">
          {path === null ? (
            <span className="asset-slot-meta unset">
              {builtInDefault === undefined
                ? `Not set · ${expectedOf(slot)}`
                : compact
                  ? `${builtInDefault.summary} · ${compactDefaultHint}`
                  : `${builtInDefault.summary} · ${expectedOf(slot)}`}
            </span>
          ) : (
            <>
              <span className="asset-path selectable" title={path}>
                {path}
              </span>
              <span className="asset-slot-meta">
                {detail ?? 'Not found'}
                {summary?.lookup.status === 'found'
                  ? ` · ${formatByteSize(summary.lookup.asset.byteSize)}`
                  : ''}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="asset-slot-actions">
        <button
          type="button"
          className="btn btn-small asset-action-assign"
          onClick={() => {
            onAssign(slot);
          }}
          title={
            usage === 'backgroundMusic'
              ? 'Choose ATRAC9 background music'
              : 'Choose PNG, JPEG, BMP or GIF artwork; VitaTheme can convert it to the required PNG'
          }
        >
          {path === null ? 'Choose…' : 'Replace…'}
        </button>
        {generation === undefined ||
        (path !== null && !generation.isGenerated && state === 'present') ? null : (
          <button
            type="button"
            className="btn btn-small asset-action-generate"
            disabled={generation.busy}
            title="Draw this preview from the theme’s own artwork"
            onClick={() => {
              generation.onGenerate(slot);
            }}
          >
            {generation.busy ? 'Drawing…' : state === 'present' ? 'Regenerate' : 'Generate'}
          </button>
        )}
        {convertible ? (
          <button
            type="button"
            className="btn btn-small asset-action-convert"
            title="Make this picture the size and kind this slot needs"
            onClick={() => {
              onConvert(slot, label);
            }}
          >
            Convert to PNG…
          </button>
        ) : null}
        {path === null ? null : (
          <button
            type="button"
            className="btn btn-quiet btn-small asset-action-clear"
            title={
              builtInDefault === undefined
                ? undefined
                : 'Take this icon out of the theme, so the console draws its own again'
            }
            onClick={() => {
              onClear(slot);
            }}
          >
            {builtInDefault === undefined ? 'Clear' : 'Restore console default'}
          </button>
        )}
      </div>
      {footer === undefined ? null : <div className="asset-slot-footer">{footer}</div>}
    </div>
  );
};
