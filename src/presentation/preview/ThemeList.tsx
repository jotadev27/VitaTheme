import type { ReactElement } from 'react';
import {
  imageConversionTarget,
  imageConversionWouldChange,
} from '@/domain/editing/image-conversion';
import { previewSource } from '@/domain/editing/preview-provenance';
import { imageAssetSpec } from '@/domain/vita/asset-specs';
import type { ThemePreviewKind } from '@/domain/vita/theme-previews';
import type { ThemeSnapshot } from '@/ipc';
import { TextField } from '../components/fields';
import { Panel } from '../components/primitives';
import { formatByteSize, formatPixels } from '../format';
import type { EditorActions } from '../state/use-editor';
import { describeThemeList, type PreviewImage } from './screen-model';
import { ScreenImage } from './ScreenFrame';

/** Theme-list artwork comes only from the theme's slots, never VitaTheme's application logo. */
const THUMBNAIL = imageAssetSpec('packageThumbnail');
const HOME_PREVIEW = imageAssetSpec('homePreview');
const PAGE_THUMBNAIL = imageAssetSpec('liveAreaThumbnail');

const ratio = (spec: { width: number; height: number }): string =>
  `${String(spec.width)} / ${String(spec.height)}`;

const ThemeListArtwork = ({
  theme,
  kind,
  label,
  image,
  actions,
  drawing,
}: {
  readonly theme: ThemeSnapshot;
  readonly kind: ThemePreviewKind;
  readonly label: string;
  readonly image: PreviewImage;
  readonly actions: EditorActions;
  readonly drawing: boolean;
}): ReactElement => {
  const path = theme.project.metadata[kind];
  const summary = theme.assets.find((candidate) => candidate.path === path);
  const found = summary?.lookup.status === 'found' ? summary.lookup.asset : null;
  const media = found?.media;
  const convertible =
    media?.kind === 'image' && imageConversionWouldChange(imageConversionTarget(kind), media);
  const source =
    path === null
      ? 'Missing'
      : previewSource(theme.project, kind) === 'generated'
        ? 'Generated'
        : 'Custom';
  const status =
    image.state === 'ready'
      ? source
      : image.state === 'unset' || image.state === 'missing'
        ? 'Missing'
        : 'Unavailable';
  const spec = imageAssetSpec(kind);

  return (
    <div className="theme-list-asset">
      <div className="theme-card-art" style={{ aspectRatio: ratio(spec) }}>
        <ScreenImage
          image={
            image.state === 'unset' ? { ...image, label: `Missing ${label.toLowerCase()}` } : image
          }
          fit="cover"
        />
      </div>
      <div className="theme-list-asset-info">
        <h4>{label}</h4>
        <span className="theme-list-asset-status" data-state={image.state}>
          {status}
        </span>
        <span className="dim">{path ?? 'No theme artwork is supplied.'}</span>
        <span className="dim">
          {media?.kind === 'image' && found !== null
            ? `${media.format.toUpperCase()} · ${formatPixels(media.width, media.height)} · ${formatByteSize(found.byteSize)}`
            : `Target ${formatPixels(spec.width, spec.height)} PNG`}
        </span>
        <div className="theme-list-asset-actions">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void actions.assignAsset({ kind })}
          >
            Replace…
          </button>
          {source === 'Custom' && image.state === 'ready' ? null : (
            <button
              type="button"
              className="btn btn-small"
              disabled={drawing}
              onClick={() => void actions.generatePreviews([kind])}
            >
              {drawing ? 'Drawing…' : image.state === 'ready' ? 'Regenerate' : 'Generate'}
            </button>
          )}
          {convertible ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                actions.beginConversion({ kind }, label);
              }}
            >
              Convert to PNG…
            </button>
          ) : null}
          {path === null ? null : (
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => void actions.clearAsset({ kind })}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ThemeList = ({
  theme,
  actions,
  drawing = false,
}: {
  readonly theme: ThemeSnapshot;
  readonly actions: EditorActions;
  readonly drawing?: boolean;
}): ReactElement => {
  const list = describeThemeList(theme);

  return (
    <>
      <Panel
        title="In the theme list"
        note={formatPixels(THUMBNAIL.width, THUMBNAIL.height)}
        actions={
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => {
              actions.selectSection('overview');
              actions.selectMode('edit');
            }}
          >
            Edit details
          </button>
        }
      >
        <ThemeListArtwork
          theme={theme}
          kind="packageThumbnail"
          label="Theme thumbnail"
          image={list.thumbnail}
          actions={actions}
          drawing={drawing}
        />
        <div className="theme-list-fields">
          <TextField
            label="Theme name"
            value={list.title}
            onCommit={(value) =>
              void actions.applyEdit({ kind: 'set-localized-default', field: 'title', value })
            }
          />
          <TextField
            label="Author"
            value={list.provider}
            onCommit={(value) =>
              void actions.applyEdit({ kind: 'set-localized-default', field: 'provider', value })
            }
          />
        </div>
      </Panel>

      <Panel
        title="Theme previews"
        note={`${formatPixels(HOME_PREVIEW.width, HOME_PREVIEW.height)} · community-reported`}
      >
        <div className="theme-list-preview-grid">
          <ThemeListArtwork
            theme={theme}
            kind="homePreview"
            label="Home screen preview"
            image={list.homePreview}
            actions={actions}
            drawing={drawing}
          />
          <ThemeListArtwork
            theme={theme}
            kind="startScreenPreview"
            label="Lock screen preview"
            image={list.startScreenPreview}
            actions={actions}
            drawing={drawing}
          />
        </div>
      </Panel>

      <Panel
        title="When browsing wallpapers"
        note={`${formatPixels(PAGE_THUMBNAIL.width, PAGE_THUMBNAIL.height)} · one per LiveArea page`}
      >
        <div className="page-thumbnails">
          {list.pageThumbnails.map((thumbnail, index) => (
            <figure key={index}>
              <div className="theme-card-art" style={{ aspectRatio: ratio(PAGE_THUMBNAIL) }}>
                <ScreenImage image={thumbnail} fit="cover" />
              </div>
              <figcaption className="dim numeric">Page {index + 1}</figcaption>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  actions.selectPage(index);
                  actions.selectSection('home');
                  actions.selectMode('edit');
                }}
              >
                Edit page thumbnail
              </button>
            </figure>
          ))}
        </div>
      </Panel>
    </>
  );
};
