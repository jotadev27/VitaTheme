import { useState, type ReactElement } from 'react';
import { assetAtSlot, type ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type { MediaDescriptor } from '@/domain/model/media';
import type { ThemeSnapshot, VitaThemeBridge } from '@/ipc';
import { AppToolbar } from './components/AppToolbar';
import { AssetPreviews } from './components/asset-previews';
import { ConfirmReplacementDialog } from './components/ConfirmReplacementDialog';
import { CloseIcon } from './components/icons';
import { NavigatorRail, PreviewRail } from './components/NavigatorRail';
import { ConvertAssetDialog } from './components/ConvertAssetDialog';
import { BulkConvertDialog } from './components/BulkConvertDialog';
import { NewThemeDialog } from './components/NewThemeDialog';
import { RecoveryDialog } from './components/RecoveryDialog';
import { StatusBar } from './components/StatusBar';
import { ValidationDock } from './components/ValidationDock';
import { WelcomeView } from './components/WelcomeView';
import { PreviewStage } from './preview/PreviewStage';
import { SectionView } from './sections/SectionView';
import { useEditor } from './state/use-editor';

/**
 * VitaTheme.
 *
 * The window is a view of a session that lives in the privileged process: it renders what it
 * was last told, and asks for things to happen. It reads no file, resolves no path and
 * decides nothing about whether a theme is valid — the report it displays was produced by the
 * format layer, which is the only thing in the application that knows the rules.
 */
/** What is in a slot right now, as the privileged side last described it. */
const mediaInSlot = (theme: ThemeSnapshot | null, slot: ThemeAssetSlot): MediaDescriptor | null => {
  if (theme === null) {
    return null;
  }

  const path = assetAtSlot(theme.project, slot);
  const summary = theme.assets.find((candidate) => candidate.path === path);
  return summary?.lookup.status === 'found' ? summary.lookup.asset.media : null;
};

export const App = ({ bridge }: { readonly bridge: VitaThemeBridge }): ReactElement => {
  const { state, actions } = useEditor(bridge);
  const [validationOpen, setValidationOpen] = useState(false);
  const theme = state.session.theme;

  const totalBytes =
    theme?.assets.reduce(
      (sum, asset) => sum + (asset.lookup.status === 'found' ? asset.lookup.asset.byteSize : 0),
      0,
    ) ?? 0;

  return (
    <div className="app">
      <AppToolbar
        session={state.session}
        pending={state.pending}
        mode={state.mode}
        actions={actions}
      />

      {theme === null ? (
        <WelcomeView
          actions={actions}
          recentProjects={state.session.recentProjects}
          busy={state.pending !== null}
        />
      ) : (
        <AssetPreviews load={actions.previewAsset} revision={theme.assetRevision}>
          <div className="workspace" data-validation-open={validationOpen}>
            {state.mode === 'preview' ? (
              <PreviewRail surface={state.surface} onSelect={actions.selectSurface} />
            ) : (
              <NavigatorRail
                section={state.section}
                issues={theme.report.issues}
                assetCount={theme.assets.length}
                totalBytes={totalBytes}
                onSelect={actions.selectSection}
              />
            )}

            {state.mode === 'preview' ? (
              <PreviewStage
                theme={theme}
                surface={state.surface}
                page={state.selectedPage}
                onSelectPage={actions.selectPage}
                actions={actions}
                drawingPreviews={state.pending === 'drawing'}
              />
            ) : (
              <SectionView
                key={state.section}
                section={state.section}
                theme={theme}
                page={state.selectedPage}
                highlightedAsset={state.highlightedAsset}
                actions={actions}
                onSelectAsset={actions.highlightAsset}
                drawingPreviews={state.pending === 'drawing'}
              />
            )}

            {validationOpen ? (
              <ValidationDock
                report={theme.report}
                assets={theme.assets}
                theme={theme}
                onConvert={(slot) => {
                  actions.beginConversion(slot, slot.kind.replace(/([A-Z])/g, ' $1'));
                }}
                onConvertAll={() => {
                  actions.openDialog({ kind: 'convert-images' });
                }}
                onClose={() => {
                  setValidationOpen(false);
                }}
                onSelectIssue={(section, assetPath) => {
                  // Going to a problem means going to where it can be fixed.
                  actions.selectMode('edit');
                  actions.selectSection(section);
                  actions.highlightAsset(assetPath);
                  setValidationOpen(false);
                }}
              />
            ) : null}
          </div>
        </AssetPreviews>
      )}

      <StatusBar
        report={theme?.report ?? null}
        lastExport={state.session.lastExport}
        onRevealExport={() => {
          void actions.revealLastExport();
        }}
        validationOpen={validationOpen}
        onToggleValidation={() => {
          setValidationOpen((open) => !open);
        }}
      />

      {state.notice === null ? null : (
        <div className="notice-layer">
          <div className="notice" data-tone={state.notice.tone} role="status">
            <span className="notice-message">{state.notice.message}</span>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={actions.dismissNotice}
              aria-label="Dismiss"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}

      {state.session.recovery === null ? null : (
        <RecoveryDialog
          offer={state.session.recovery}
          onRecover={() => {
            void actions.recoverProject();
          }}
          onDiscard={() => {
            void actions.discardRecovery();
          }}
        />
      )}

      {state.dialog?.kind === 'new-theme' && (
        <NewThemeDialog
          onCancel={actions.closeDialog}
          onCreate={(request) => {
            void actions.startDraft(request);
          }}
        />
      )}

      {state.dialog?.kind === 'convert-asset' && (
        <ConvertAssetDialog
          slot={state.dialog.slot}
          label={state.dialog.label}
          media={mediaInSlot(theme, state.dialog.slot)}
          busy={state.pending === 'converting'}
          onCancel={actions.closeDialog}
          onConvert={(fit) => {
            if (state.dialog?.kind === 'convert-asset') {
              void actions.convertAsset(state.dialog.slot, fit);
            }
          }}
        />
      )}

      {state.dialog?.kind === 'convert-images' && theme !== null && (
        <BulkConvertDialog
          theme={theme}
          busy={state.pending === 'converting'}
          onCancel={actions.closeDialog}
          onConvert={(fit) => void actions.convertIncompatibleImages(fit)}
        />
      )}

      {state.dialog?.kind === 'confirm-replacement' && (
        <ConfirmReplacementDialog
          name={state.dialog.name}
          format={state.dialog.format}
          onCancel={actions.closeDialog}
          onConfirm={() => {
            void actions.confirmReplacement();
          }}
        />
      )}
    </div>
  );
};
