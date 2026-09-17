import { useState, type ReactElement } from 'react';
import { incompatibleImageSlots } from '@/domain/editing/bulk-image-conversion';
import { formatContentVersion } from '@/domain/model/content-version';
import type { LocalizedField } from '@/domain/editing/theme-edit';
import { generatablePreviews, previewSource } from '@/domain/editing/preview-provenance';
import { HOME_APP_SLOT_IDS } from '@/domain/vita/home-app-slots';
import { THEME_PREVIEW_KINDS, type ThemePreviewKind } from '@/domain/vita/theme-previews';
import { isObservedLanguageCode, languageLabel } from '@/domain/vita/languages';
import type { ThemeSnapshot } from '@/ipc';
import { AssetSlotControl } from '../components/AssetSlotControl';
import { TextField } from '../components/fields';
import { Badge, Panel } from '../components/primitives';
import { formatByteSize, formatCount } from '../format';
import type { EditorActions } from '../state/use-editor';

/**
 * What the console shows about a theme before anything of it is on screen: its name, who
 * made it, and the pictures it is browsed by.
 */

const totalBytes = (theme: ThemeSnapshot): number =>
  theme.assets.reduce(
    (sum, asset) => sum + (asset.lookup.status === 'found' ? asset.lookup.asset.byteSize : 0),
    0,
  );

const translatedLanguages = (theme: ThemeSnapshot): readonly string[] => {
  const { title, provider } = theme.project.metadata;
  return [...new Set([...title.translations.keys(), ...provider.translations.keys()])].sort();
};

const TranslationRow = ({
  language,
  theme,
  actions,
}: {
  readonly language: string;
  readonly theme: ThemeSnapshot;
  readonly actions: EditorActions;
}): ReactElement => {
  const { title, provider } = theme.project.metadata;

  const set = (field: LocalizedField, value: string): void => {
    void actions.applyEdit({
      kind: 'set-translation',
      field,
      language,
      value: value.trim().length === 0 ? null : value,
    });
  };

  return (
    <tr>
      <td>
        <span className="translation-code mono">{language}</span>
        <span className="dim"> {languageLabel(language)}</span>
        {isObservedLanguageCode(language) ? null : <Badge tone="warning">Unverified</Badge>}
      </td>
      <td>
        <input
          className="field-input"
          defaultValue={title.translations.get(language) ?? ''}
          maxLength={200}
          key={`title:${language}:${String(theme.revision)}`}
          onBlur={(event) => {
            set('title', event.target.value);
          }}
        />
      </td>
      <td>
        <input
          className="field-input"
          defaultValue={provider.translations.get(language) ?? ''}
          maxLength={200}
          key={`provider:${language}:${String(theme.revision)}`}
          onBlur={(event) => {
            set('provider', event.target.value);
          }}
        />
      </td>
      <td className="table-align-end">
        <button
          type="button"
          className="btn btn-quiet btn-small"
          onClick={() => {
            void actions.applyEdit({
              kind: 'set-translation',
              field: 'title',
              language,
              value: null,
            });
            void actions.applyEdit({
              kind: 'set-translation',
              field: 'provider',
              language,
              value: null,
            });
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
};

const AddTranslation = ({ actions }: { readonly actions: EditorActions }): ReactElement => {
  const [code, setCode] = useState('');

  const add = (): void => {
    const language = code.trim().toLowerCase();
    if (language.length === 0) {
      return;
    }

    void actions.applyEdit({ kind: 'set-translation', field: 'title', language, value: '' });
    setCode('');
  };

  return (
    <div className="inline-form">
      <input
        className="field-input field-input-narrow mono"
        value={code}
        maxLength={8}
        placeholder="fr"
        aria-label="Language code"
        onChange={(event) => {
          setCode(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            add();
          }
        }}
      />
      <button type="button" className="btn btn-small" onClick={add} disabled={code.trim() === ''}>
        Add language
      </button>
      <span className="field-hint">
        The console falls back to the name above for any language a theme does not translate.
      </span>
    </div>
  );
};

const PREVIEW_LABELS: Readonly<Record<ThemePreviewKind, string>> = {
  homePreview: 'Home screen preview',
  startScreenPreview: 'Lock screen preview',
  packageThumbnail: 'Theme thumbnail',
};

/**
 * The three pictures the console shows while somebody is browsing themes.
 *
 * Each can be drawn from the theme's own artwork or supplied by hand, and the slot says
 * which it is holding. "Generate previews" covers the ones that are empty or were drawn
 * here; a picture somebody chose is only ever redrawn by pressing Regenerate on that slot.
 */
const PreviewSlots = ({
  theme,
  actions,
  busy,
}: {
  readonly theme: ThemeSnapshot;
  readonly actions: EditorActions;
  readonly busy: boolean;
}): ReactElement => {
  const { project } = theme;
  const outstanding = generatablePreviews(project);

  return (
    <Panel
      title="Preview images"
      note="Used by the PS Vita theme browser"
      actions={
        outstanding.length === 0 ? null : (
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => {
                void actions.generatePreviews(outstanding);
              }}
            >
              {busy ? 'Drawing…' : 'Generate previews'}
            </button>
          </div>
        )
      }
    >
      <p className="panel-lead">
        Generate these from the theme’s artwork, then regenerate them after artwork changes. Custom
        previews are never replaced automatically.
      </p>
      <div className="slot-list">
        {THEME_PREVIEW_KINDS.map((kind) => (
          <AssetSlotControl
            key={kind}
            label={PREVIEW_LABELS[kind]}
            slot={{ kind }}
            path={project.metadata[kind]}
            assets={theme.assets}
            onAssign={(slot) => void actions.assignAsset(slot)}
            onClear={(slot) => void actions.clearAsset(slot)}
            onConvert={actions.beginConversion}
            onDrop={(target, file) => void actions.dropAsset(target, file)}
            generation={{
              isGenerated: previewSource(project, kind) === 'generated',
              busy,
              onGenerate: () => {
                void actions.generatePreviews([kind]);
              },
            }}
          />
        ))}
      </div>
    </Panel>
  );
};

export const OverviewSection = ({
  theme,
  actions,
  drawingPreviews = false,
}: {
  readonly theme: ThemeSnapshot;
  readonly actions: EditorActions;
  /** True while previews are being drawn, so the buttons that would ask again say so. */
  readonly drawingPreviews?: boolean | undefined;
}): ReactElement => {
  const { metadata, home } = theme.project;
  const languages = translatedLanguages(theme);
  const incompatible = incompatibleImageSlots(theme.project, theme.assets).length;

  return (
    <>
      <Panel title="Identity">
        <div className="field-grid">
          <TextField
            label="Theme name"
            value={metadata.title.defaultValue}
            placeholder="Shown in the console's theme list"
            onCommit={(value) => {
              void actions.applyEdit({ kind: 'set-localized-default', field: 'title', value });
            }}
          />
          <TextField
            label="Author"
            value={metadata.provider.defaultValue}
            placeholder="Shown next to the theme name"
            onCommit={(value) => {
              void actions.applyEdit({ kind: 'set-localized-default', field: 'provider', value });
            }}
          />
          <TextField
            label="Version"
            value={formatContentVersion(metadata.contentVersion)}
            maxLength={5}
            hint="Two digits, a dot and two digits. The console refuses any other form."
            onCommit={(value) => {
              void actions.applyEdit({ kind: 'set-content-version', value });
            }}
          />
        </div>
      </Panel>

      <PreviewSlots theme={theme} actions={actions} busy={drawingPreviews} />

      {incompatible > 0 ? (
        <div className="bulk-convert-prompt">
          <span>
            {String(incompatible)} image{incompatible === 1 ? '' : 's'} can be converted to the
            required PNG size and encoding.
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
        title="Contents"
        note={`${formatCount(theme.assets.length, 'file')} · ${formatByteSize(totalBytes(theme))}`}
      >
        <dl className="props">
          <dt className="prop-label">LiveArea pages</dt>
          <dd className="prop-value">{formatCount(home.pages.length, 'page')}</dd>
          <dt className="prop-label">Application icons</dt>
          <dd className="prop-value">
            {home.appIcons.size === 0
              ? 'Console defaults — no system icon replacements exported'
              : `${String(home.appIcons.size)} of ${String(HOME_APP_SLOT_IDS.length)} replaced`}
          </dd>
        </dl>
      </Panel>

      <Panel
        title="Translations"
        note={languages.length === 0 ? undefined : formatCount(languages.length, 'language')}
      >
        {languages.length === 0 ? null : (
          <div className="table-scroll">
            <table className="table table-inline">
              <thead>
                <tr>
                  <th>Language</th>
                  <th>Theme name</th>
                  <th>Author</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {languages.map((language) => (
                  <TranslationRow
                    key={language}
                    language={language}
                    theme={theme}
                    actions={actions}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddTranslation actions={actions} />
      </Panel>
    </>
  );
};
