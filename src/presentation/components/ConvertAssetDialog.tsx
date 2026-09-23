import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  dragImageCrop,
  imageCropPlacement,
  MAX_IMAGE_ZOOM,
  RESET_IMAGE_CROP,
  type ImageCrop,
} from '@/domain/editing/image-crop';
import { imageConversionTarget } from '@/domain/editing/image-conversion';
import { assetSlotUsage, type ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import { formatPixels } from '../format';

export interface CropSource {
  readonly width: number;
  readonly height: number;
  readonly dataUrl?: string;
  readonly path?: string;
}

/** The viewport uses the same cover, displacement and rounding calculations as export. */
export const ConvertAssetDialog = ({
  slot,
  label,
  source,
  busy,
  onCancel,
  onApply,
  loadSource,
}: {
  readonly slot: ThemeAssetSlot;
  readonly label: string;
  readonly source: CropSource;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onApply: (crop: ImageCrop) => void;
  readonly loadSource: (path: string) => Promise<string | null>;
}): ReactElement => {
  const [crop, setCrop] = useState<ImageCrop>(RESET_IMAGE_CROP);
  const [shape, setShape] = useState<'square' | 'circle'>('square');
  const [dataUrl, setDataUrl] = useState<string | null>(source.dataUrl ?? null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const usage = assetSlotUsage(slot);
  const target = usage === 'backgroundMusic' ? null : imageConversionTarget(usage);
  const canBeCircle = target?.allowsCircle ?? false;
  const zoomPercent = Math.round(((crop.zoom - 1) / (MAX_IMAGE_ZOOM - 1)) * 100);

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  useEffect(() => {
    if (source.path === undefined) return;
    let current = true;
    void loadSource(source.path).then((url) => {
      if (current) setDataUrl(url);
    });
    return () => {
      current = false;
    };
  }, [source.path, loadSource]);

  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const place =
    target === null
      ? null
      : imageCropPlacement(source.width, source.height, target.width, target.height, crop);
  const scale = target === null ? 1 : size.width / target.width;
  const move = (dx: number, dy: number): void => {
    if (target === null) return;
    setCrop((previous) =>
      dragImageCrop(
        previous,
        dx,
        dy,
        size.width,
        size.height,
        source.width,
        source.height,
        target.width,
        target.height,
      ),
    );
  };

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialog}
        className="dialog crop-dialog"
        role="dialog"
        aria-labelledby="crop-title"
        aria-modal
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        <div className="dialog-head">
          <h2 id="crop-title">Position “{label}”</h2>
        </div>
        <div className="dialog-body crop-body">
          <p className="dialog-text">
            Drag the image to choose the area that will appear in the final PNG. The frame has the
            asset’s exact proportions.
          </p>
          <div
            ref={viewport}
            className="crop-viewport"
            data-shape={canBeCircle ? shape : 'square'}
            role="img"
            tabIndex={0}
            aria-label="Image crop preview. Drag to position, or use the arrow keys."
            style={
              target === null
                ? undefined
                : {
                    width: `min(100%, ${String(Math.min(680, (400 * target.width) / target.height))}px)`,
                    aspectRatio: `${String(target.width)} / ${String(target.height)}`,
                  }
            }
            onPointerDown={(event) => {
              if (dataUrl === null || busy) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              lastPointer.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              const previous = lastPointer.current;
              if (previous === null) return;
              move(event.clientX - previous.x, event.clientY - previous.y);
              lastPointer.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerUp={() => {
              lastPointer.current = null;
            }}
            onPointerCancel={() => {
              lastPointer.current = null;
            }}
            onKeyDown={(event) => {
              const steps: Record<string, readonly [number, number]> = {
                ArrowLeft: [-10, 0],
                ArrowRight: [10, 0],
                ArrowUp: [0, -10],
                ArrowDown: [0, 10],
              };
              const step = steps[event.key];
              if (step !== undefined) {
                event.preventDefault();
                move(step[0], step[1]);
              }
            }}
          >
            {dataUrl === null || place === null ? (
              <span className="crop-loading">Loading image…</span>
            ) : (
              <div className="crop-image-layer">
                <img
                  src={dataUrl}
                  alt=""
                  draggable={false}
                  style={{
                    width: place.width * scale,
                    height: place.height * scale,
                    left: place.left * scale,
                    top: place.top * scale,
                  }}
                />
              </div>
            )}
          </div>
          {canBeCircle && (
            <fieldset className="crop-shape">
              <legend>Shape</legend>
              <label>
                <input
                  type="radio"
                  name="crop-shape"
                  checked={shape === 'square'}
                  disabled={busy}
                  onChange={() => {
                    setShape('square');
                  }}
                />{' '}
                Square
              </label>
              <label>
                <input
                  type="radio"
                  name="crop-shape"
                  checked={shape === 'circle'}
                  disabled={busy}
                  onChange={() => {
                    setShape('circle');
                  }}
                />{' '}
                Circle
              </label>
            </fieldset>
          )}
          <div className="crop-controls">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => {
                setCrop(RESET_IMAGE_CROP);
              }}
            >
              Reset
            </button>
            <label htmlFor="crop-zoom">Zoom</label>
            <input
              id="crop-zoom"
              type="range"
              min="0"
              max="100"
              step="1"
              value={zoomPercent}
              disabled={busy || dataUrl === null}
              onChange={(event) => {
                setCrop((previous) => ({
                  ...previous,
                  zoom: 1 + (Number(event.target.value) / 100) * (MAX_IMAGE_ZOOM - 1),
                }));
              }}
            />
            <output className="crop-zoom-value" htmlFor="crop-zoom">
              {zoomPercent}%
            </output>
          </div>
          <p className="field-hint">
            Exports as{' '}
            {target === null ? 'PNG' : `${formatPixels(target.width, target.height)} PNG`}.{' '}
            {target?.colorModel === 'indexed'
              ? 'Colours are reduced to a palette and may shift slightly. '
              : ''}
            The original image is left untouched.
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || dataUrl === null || target === null}
            onClick={() => {
              onApply({ ...crop, shape: canBeCircle ? shape : 'square' });
            }}
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};
