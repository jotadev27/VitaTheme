import { useState, type DragEvent, type ReactElement } from 'react';
import { incompatibleImageSlots } from '@/domain/editing/bulk-image-conversion';
import {
  pageThumbnailSource,
  type PageThumbnailSource,
} from '@/domain/editing/page-thumbnail-provenance';
import type { LiveAreaPage } from '@/domain/model/theme-project';
import type { ThemeAssetSummary } from '@/domain/validation/asset-inventory';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import { allHomeAppSlots } from '@/domain/vita/home-app-slots';
import { MAX_LIVE_AREA_PAGES } from '@/domain/vita/live-area';
import type { ThemeSnapshot } from '@/ipc';
import { SystemIconArtwork } from '../assets/system-icon-artwork';
import { AssetSlotControl } from '../components/AssetSlotControl';
import { useAssetPreview } from '../components/asset-previews';
import { BackgroundMusicControl } from '../components/BackgroundMusicControl';
import { ColorField, NumberField, TriStateField } from '../components/fields';
import { assetDetail, EmptyState, Panel } from '../components/primitives';
import { formatPixels } from '../format';
import type { EditorActions } from '../state/use-editor';

/**
 * The home screen: the pages you swipe between, the icons on them, and the music behind it.
 *
 * Laid out the way the console is rather than the way the manifest is — one page at a time,
 * because that is how somebody looks at it while they are making one.
 */

const THUMBNAIL = imageAssetSpec('liveAreaThumbnail');

const ThumbnailDetails = ({
  path,
  assets,
  source,
  hasBackground,
  onReplace,
  onUseGenerated,
}: {
  readonly path: LiveAreaPage['thumbnail'];
  readonly assets: readonly ThemeAssetSummary[];
  readonly source: PageThumbnailSource;
  readonly hasBackground: boolean;
  readonly onReplace: () => void;
  readonly onUseGenerated: () => void;
}): ReactElement => {
  const preview = useAssetPreview(path);
  const summary = assets.find((asset) => asset.path === path);

  return (
    <div className="page-thumbnail-details">
      <div className="page-thumbnail-preview" aria-hidden="true">
        {preview === null ? (
          <span className="asset-slot-placeholder">—</span>
        ) : (
          <img src={preview} alt="" />
        )}
      </div>
      <div className="page-thumbnail-detail-body">
        <span className="page-thumbnail-detail-source">
          {source === 'custom'
            ? 'Custom override'
            : source === 'generated'
              ? 'Generated from background'
              : 'No thumbnail yet'}
        </span>
        {path === null ? null : (
          <span className="asset-path selectable" title={path}>
            {path}
          </span>
        )}
        {summary === undefined ? null : (
          <span className="asset-slot-meta">{assetDetail(summary) ?? 'Not found'}</span>
        )}
        <div className="page-thumbnail-detail-actions">
          <button type="button" className="btn btn-small" onClick={onReplace}>
            {path === null ? 'Choose…' : 'Replace…'}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-small"
            disabled={!hasBackground}
            onClick={onUseGenerated}
          >
            Use generated thumbnail
          </button>
        </div>
      </div>
    </div>
  );
};

const PageThumbnailControl = ({
  current,
  page,
  source,
  assets,
  actions,
}: {
  readonly current: LiveAreaPage;
  readonly page: number;
  readonly source: PageThumbnailSource;
  readonly assets: readonly ThemeAssetSummary[];
  readonly actions: EditorActions;
}): ReactElement => {
  const [customizing, setCustomizing] = useState(false);
  const hasBackground = current.background !== null;
  const thumbnailSlot = { kind: 'liveAreaThumbnail', page } as const;
  const useGenerated = (): void => {
    setCustomizing(false);
    void actions.generatePageThumbnail(page);
  };
  const onThumbnailDrag = (event: DragEvent<HTMLDivElement>): void => {
    // While compact, the whole card remains the background's drop target. Once customization
    // is open, its thumbnail area accepts a separate image instead.
    if (!customizing) return;
    event.stopPropagation();
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };
  const onThumbnailDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!customizing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length !== 1) return;
    const file = event.dataTransfer.files[0];
    if (file !== undefined) void actions.dropAsset(thumbnailSlot, file);
  };

  return (
    <div
      className="page-thumbnail"
      data-source={source}
      onDragEnter={onThumbnailDrag}
      onDragOver={onThumbnailDrag}
      onDrop={onThumbnailDrop}
    >
      <div className="page-thumbnail-summary">
        <div className="page-thumbnail-summary-text">
          <span className="page-thumbnail-label">Thumbnail</span>
          <span className="page-thumbnail-status">
            {source === 'custom'
              ? 'Custom override'
              : source === 'generated'
                ? 'Generated automatically'
                : 'Not set'}
            {' · '}
            {formatPixels(THUMBNAIL.width, THUMBNAIL.height)}
          </span>
        </div>
        <div className="page-thumbnail-actions">
          <button
            type="button"
            className="btn btn-quiet btn-small"
            aria-expanded={customizing}
            onClick={() => {
              setCustomizing((shown) => !shown);
            }}
          >
            {customizing ? 'Hide details' : 'Customize…'}
          </button>
          {!customizing && source !== 'generated' && hasBackground ? (
            <button type="button" className="btn btn-small" onClick={useGenerated}>
              Use generated thumbnail
            </button>
          ) : null}
        </div>
      </div>
      {customizing ? (
        <ThumbnailDetails
          path={current.thumbnail}
          assets={assets}
          source={source}
          hasBackground={hasBackground}
          onReplace={() => {
            void actions.assignAsset(thumbnailSlot);
          }}
          onUseGenerated={useGenerated}
        />
      ) : null}
    </div>
  );
};

const PageEditor = ({
  theme,
  page,
  actions,
}: {
  readonly theme: ThemeSnapshot;
  readonly page: number;
  readonly actions: EditorActions;
}): ReactElement | null => {
  const current = theme.project.home.pages[page];
  if (current === undefined) {
    return null;
  }

  return (
    <div className="page-editor">
      <div className="slot-list">
        <AssetSlotControl
          label="Background"
          featured
          slot={{ kind: 'liveAreaBackground', page }}
          path={current.background}
          assets={theme.assets}
          onAssign={(slot) => void actions.assignAsset(slot)}
          onClear={(slot) => void actions.clearAsset(slot)}
          onConvert={actions.beginConversion}
          onDrop={(target, file) => void actions.dropAsset(target, file)}
          footer={
            <PageThumbnailControl
              current={current}
              page={page}
              source={pageThumbnailSource(theme.project, page)}
              assets={theme.assets}
              actions={actions}
            />
          }
        />
      </div>

      <div className="field-grid">
        <ColorField
          label="Application label colour"
          value={current.bubbleFontColor}
          hint="The text under each application bubble."
          onCommit={(value) => {
            void actions.applyEdit({
              kind: 'set-color',
              slot: { kind: 'bubbleFont', page },
              value,
            });
          }}
        />
        <TriStateField
          label="Label shadow"
          value={current.bubbleFontShadow}
          onCommit={(value) => {
            void actions.applyEdit({ kind: 'set-bubble-shadow', page, value });
          }}
        />
        <NumberField
          label="Wave type"
          value={current.waveType}
          // Matches `WAVE_TYPE_IS_DOCUMENTED` in the format layer, which records that no
          // mapping of these values is known. The two are meant to change together.
          hint="The stock animation seen while swiping. No list of values is documented, so whatever a theme uses is kept as it is."

          onCommit={(value) => {
            void actions.applyEdit({ kind: 'set-wave-type', page, value });
          }}
        />
      </div>
    </div>
  );
};

export const HomeSection = ({
  theme,
  page: selected,
  actions,
}: {
  readonly theme: ThemeSnapshot;
  /** Shared with the preview, so both are always looking at the same page. */
  readonly page: number;
  readonly actions: EditorActions;
}): ReactElement => {
  const { home } = theme.project;
  const page = Math.min(selected, Math.max(home.pages.length - 1, 0));
  const incompatible = incompatibleImageSlots(theme.project, theme.assets).length;

  return (
    <>
      <Panel
        title="LiveArea pages"
        note={`${String(home.pages.length)} of ${String(MAX_LIVE_AREA_PAGES)}`}
        actions={
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-quiet btn-small"
              disabled={page <= 0}
              onClick={() => {
                void actions.applyEdit({ kind: 'move-page', page, to: page - 1 });
                actions.selectPage(page - 1);
              }}
            >
              Move earlier
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              disabled={page >= home.pages.length - 1}
              onClick={() => {
                void actions.applyEdit({ kind: 'move-page', page, to: page + 1 });
                actions.selectPage(page + 1);
              }}
            >
              Move later
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              disabled={home.pages.length <= 1}
              onClick={() => {
                void actions.applyEdit({ kind: 'remove-page', page });
                actions.selectPage(Math.max(page - 1, 0));
              }}
            >
              Remove page
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={home.pages.length >= MAX_LIVE_AREA_PAGES}
              onClick={() => {
                void actions.applyEdit({ kind: 'add-page' });
                actions.selectPage(home.pages.length);
              }}
            >
              Add page
            </button>
          </div>
        }
      >
        {home.pages.length === 0 ? (
          <EmptyState title="No pages" hint="A theme styles at least one LiveArea page." />
        ) : (
          <>
            <div className="page-tabs" role="tablist" aria-label="LiveArea pages">
              {home.pages.map((candidate, index) => (
                <button
                  // Pages have no identity of their own; their position is what they are.
                  key={index}
                  type="button"
                  role="tab"
                  className="page-tab"
                  aria-selected={index === page}
                  onClick={() => {
                    actions.selectPage(index);
                  }}
                >
                  <span className="page-tab-number numeric">{index + 1}</span>
                  <span
                    className="asset-dot"
                    data-state={candidate.background === null ? 'empty' : 'present'}
                  />
                </button>
              ))}
            </div>
            <PageEditor key={page} theme={theme} page={page} actions={actions} />
          </>
        )}
      </Panel>

      {incompatible > 0 ? (
        <div className="bulk-convert-prompt">
          <span>
            {String(incompatible)} image{incompatible === 1 ? '' : 's'} across the theme can be
            converted to the required PNG format.
          </span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              actions.openDialog({ kind: 'convert-images' });
            }}
          >
            Convert incompatible images…
          </button>
        </div>
      ) : null}

      <Panel
        title="Application icons"
        note={`${String(home.appIcons.size)} of ${String(allHomeAppSlots().length)} replaced`}
        actions={
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-small"
              title="Replace several icons at once from a folder of them"
              onClick={() => void actions.importIconSet()}
            >
              Import icon set…
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              disabled={home.appIcons.size === 0}
              title="Remove every theme replacement so the PS Vita provides its own system icons"
              onClick={() => void actions.applyEdit({ kind: 'restore-system-icons' })}
            >
              Restore all console defaults
            </button>
          </div>
        }
      >
        <p className="panel-lead">
          An icon you do not replace stays as the console draws it. The marks below stand for those
          and are not part of the exported theme.
        </p>
        <div className="slot-grid">
          {allHomeAppSlots().map((slot) => (
            <AssetSlotControl
              key={slot.id}
              compact
              label={slot.label}
              slot={{ kind: 'appIcon', application: slot.id }}
              path={home.appIcons.get(slot.id) ?? null}
              assets={theme.assets}
              builtInDefault={{
                artwork: <SystemIconArtwork slot={slot.id} />,
                summary: 'Provided by the PS Vita — not exported with the theme',
              }}
              onAssign={(target) => void actions.assignAsset(target)}
              onClear={(target) => void actions.clearAsset(target)}
              onConvert={actions.beginConversion}
              onDrop={(target, file) => void actions.dropAsset(target, file)}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Page indicators and music">
        <div className="slot-list">
          <AssetSlotControl
            label="Other pages"
            slot={{ kind: 'basePageIndicator' }}
            path={home.basePageIndicator}
            assets={theme.assets}
            onAssign={(slot) => void actions.assignAsset(slot)}
            onClear={(slot) => void actions.clearAsset(slot)}
            onConvert={actions.beginConversion}
            onDrop={(target, file) => void actions.dropAsset(target, file)}
          />
          <AssetSlotControl
            label="Current page"
            slot={{ kind: 'currentPageIndicator' }}
            path={home.currentPageIndicator}
            assets={theme.assets}
            onAssign={(slot) => void actions.assignAsset(slot)}
            onClear={(slot) => void actions.clearAsset(slot)}
            onConvert={actions.beginConversion}
            onDrop={(target, file) => void actions.dropAsset(target, file)}
          />
        </div>
        <div className="music-section">
          <h4>Background music</h4>
          <BackgroundMusicControl theme={theme} actions={actions} />
        </div>
      </Panel>
    </>
  );
};
