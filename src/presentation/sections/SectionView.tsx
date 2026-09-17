import type { ReactElement } from 'react';
import type { ThemeSnapshot } from '@/ipc';
import { SECTIONS, type SectionId } from '../state/sections';
import type { EditorActions } from '../state/use-editor';
import { AssetsSection } from './AssetsSection';
import { HomeSection } from './HomeSection';
import { InformationBarSection } from './InformationBarSection';
import { OverviewSection } from './OverviewSection';
import { StartScreenSection } from './StartScreenSection';

/**
 * The centre of the window: whichever part of the theme is being worked on.
 *
 * Each section edits the part of the theme it is named after, and none of them holds a copy
 * of it — a change is asked for, and what comes back is what the theme now is.
 */
export const SectionView = ({
  section,
  theme,
  page,
  highlightedAsset,
  actions,
  onSelectAsset,
  drawingPreviews = false,
}: {
  readonly section: SectionId;
  readonly theme: ThemeSnapshot;
  readonly page: number;
  readonly highlightedAsset: string | null;
  readonly actions: EditorActions;
  readonly onSelectAsset: (path: string) => void;
  /** True while previews are being drawn; the section shows it on the buttons that ask. */
  readonly drawingPreviews?: boolean | undefined;
}): ReactElement => {
  const heading = SECTIONS.find((entry) => entry.id === section);

  const body = ((): ReactElement => {
    switch (section) {
      case 'overview':
        return (
          <OverviewSection theme={theme} actions={actions} drawingPreviews={drawingPreviews} />
        );
      case 'home':
        return <HomeSection theme={theme} page={page} actions={actions} />;
      case 'start-screen':
        return <StartScreenSection theme={theme} actions={actions} />;
      case 'information-bar':
        return <InformationBarSection theme={theme} actions={actions} />;
      case 'assets':
        return (
          <AssetsSection
            theme={theme}
            highlighted={highlightedAsset}
            onSelectAsset={onSelectAsset}
          />
        );
    }
  })();

  return (
    <main className="stage">
      <div className="stage-heading">
        <h2>{heading?.label ?? ''}</h2>
        <span className="dim">{heading?.description ?? ''}</span>
      </div>
      {body}
    </main>
  );
};
