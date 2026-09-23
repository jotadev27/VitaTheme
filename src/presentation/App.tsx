import { useState, type ReactElement } from 'react';
import { assetAtSlot, type ThemeAssetSlot } from '@/domain/editing/theme-asset-slot';
import type { MediaDescriptor } from '@/domain/model/media';
import type { ThemeSnapshot, VitaThemeBridge } from '@/ipc';
import { AppToolbar } from './components/AppToolbar';
import { AssetPreviews } from './components/asset-previews';
import { ConfirmReplacementDialog } from './components/ConfirmReplacementDialog';
import { NoticeToast } from './components/NoticeToast';
import { NavigatorRail, PreviewRail } from './components/NavigatorRail';
import { ConvertAssetDialog } from './components/ConvertAssetDialog';
import { NewThemeDialog } from './components/NewThemeDialog';
import { RecoveryDialog } from './components/RecoveryDialog';
import { StatusBar } from './components/StatusBar';
import { ValidationDock } from './components/ValidationDock';
import { WelcomeView } from './components/WelcomeView';
import { PreviewStage } from './preview/PreviewStage';
import { SectionView } from './sections/SectionView';
import { useEditor } from './state/use-editor';
import { assetSlotLabel } from './state/asset-slot-label';

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

const cropSourceInSlot = (theme: ThemeSnapshot, slot: ThemeAssetSlot) => {
  const media = mediaInSlot(theme, slot);
  if (media?.kind !== 'image') return null;
  const path = assetAtSlot(theme.project, slot);
  return {
    width: media.width,
    height: media.height,
    ...(path === null ? {} : { path }),
  };
};

export const App = ({ bridge }: { readonly bridge: VitaThemeBridge }): ReactElement => {
  const { state, actions } = useEditor(bridge);
  const [validationOpen, setValidationOpen] = useState(false);
  const theme = state.session.theme;
  const existingCropSource =
    theme !== null && state.dialog?.kind === 'convert-asset'
      ? cropSourceInSlot(theme, state.dialog.slot)
      : null;

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
                  actions.beginConversion(slot, assetSlotLabel(slot));
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
        <NoticeToast key={state.noticeId} notice={state.notice} onDismiss={actions.dismissNotice} />
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

      {state.dialog?.kind === 'convert-asset' && existingCropSource !== null && (
        <ConvertAssetDialog
          slot={state.dialog.slot}
          label={state.dialog.label}
          source={existingCropSource}
          busy={state.pending === 'converting'}
          onCancel={actions.closeDialog}
          loadSource={actions.previewCropSource}
          onApply={(crop) => {
            if (state.dialog?.kind === 'convert-asset') {
              void actions.convertAsset(state.dialog.slot, crop);
            }
          }}
        />
      )}

      {state.dialog?.kind === 'crop-selected' && (
        <ConvertAssetDialog
          slot={state.dialog.slot}
          label={state.dialog.label}
          source={{
            width: state.dialog.width,
            height: state.dialog.height,
            dataUrl: state.dialog.dataUrl,
          }}
          busy={state.pending === 'converting'}
          loadSource={actions.previewAsset}
          onCancel={() => {
            if (state.dialog?.kind === 'crop-selected')
              actions.cancelSelectedAsset(state.dialog.token);
            actions.closeDialog();
          }}
          onApply={(crop) => {
            if (state.dialog?.kind === 'crop-selected')
              void actions.applySelectedCrop(state.dialog.token, crop);
          }}
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
