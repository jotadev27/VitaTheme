import type { ReactElement } from 'react';
import { MAX_LIVE_AREA_PAGES } from '@/domain/vita/live-area';
import type { ThemeSnapshot } from '@/ipc';
import type { EditorActions } from '../state/use-editor';
import { HomeScreen } from './HomeScreen';
import { InformationBarDetail } from './InformationBarDetail';
import { LockScreen } from './LockScreen';
import { ThemeList } from './ThemeList';
import { PREVIEW_SURFACES, type PreviewSurfaceId } from './surfaces';

/**
 * The preview, as a mode of the same workspace the editor uses.
 *
 * Everything shown here is derived from the snapshot the editor is working on, so the two
 * cannot disagree: there is one theme, on the other side of the bridge, and both are looking
 * at it.
 */
export const PreviewStage = ({
  theme,
  surface,
  page,
  onSelectPage,
  actions,
  drawingPreviews = false,
}: {
  readonly theme: ThemeSnapshot;
  readonly surface: PreviewSurfaceId;
  readonly page: number;
  readonly onSelectPage: (page: number) => void;
  readonly actions: EditorActions;
  readonly drawingPreviews?: boolean;
}): ReactElement => {
  const heading = PREVIEW_SURFACES.find((candidate) => candidate.id === surface);
  const pages = theme.project.home.pages;

  return (
    <main className="stage stage-preview">
      <div className="stage-heading">
        <h2>{heading?.label ?? 'Preview'}</h2>
        <span className="dim">{heading?.description ?? ''}</span>

        {surface === 'home' && pages.length > 1 ? (
          <div className="page-tabs page-tabs-inline" role="tablist" aria-label="LiveArea pages">
            {pages.map((candidate, index) => (
              <button
                // Pages have no identity of their own; their position is what they are.
                key={index}
                type="button"
                role="tab"
                className="page-tab"
                aria-selected={index === page}
                onClick={() => {
                  onSelectPage(index);
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
        ) : null}
      </div>

      {surface === 'home' ? (
        <HomeScreen theme={theme} page={Math.min(page, MAX_LIVE_AREA_PAGES - 1)} />
      ) : null}
      {surface === 'lock-screen' ? <LockScreen theme={theme} /> : null}
      {surface === 'information-bar' ? <InformationBarDetail theme={theme} /> : null}
      {surface === 'theme-list' ? (
        <ThemeList theme={theme} actions={actions} drawing={drawingPreviews} />
      ) : null}
    </main>
  );
};
