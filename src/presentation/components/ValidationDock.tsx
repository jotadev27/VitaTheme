import { useState, type ReactElement } from 'react';
import { incompatibleImageSlots } from '@/domain/editing/bulk-image-conversion';
import {
  assetAtSlot,
  assetSlotUsage,
  type ThemeAssetSlot,
} from '@/domain/editing/theme-asset-slot';
import { imageConversionTarget } from '@/domain/editing/image-conversion';
import type { ThemeSnapshot } from '@/ipc';
import type { ThemeAssetSummary } from '@/domain/validation/asset-inventory';
import type { ValidationIssue } from '@/domain/validation/issue';
import { errorsIn, hasErrors, warningsIn, type ValidationReport } from '@/domain/validation/report';
import { formatCount } from '../format';
import { formatPixels } from '../format';
import { sectionForLocation, type SectionId } from '../state/sections';
import { CheckIcon, CloseIcon } from './icons';
import { EmptyState } from './primitives';

/**
 * The full report, opened from the compact verdict in the status bar.
 *
 * Errors and warnings are not two shades of the same thing: an error is the console refusing
 * the theme and it stops an export, a warning is something worth knowing that rests on a rule
 * nobody has confirmed. The dock says which is which in the mark, the order and the verdict
 * at the bottom, and never invents a severity of its own — it shows what the validator said.
 */

type IssueFilter = 'all' | 'error' | 'warning';

const FILTERS: readonly { readonly id: IssueFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warning', label: 'Warnings' },
];

const orderedIssues = (
  report: ValidationReport,
  filter: IssueFilter,
): readonly ValidationIssue[] => {
  switch (filter) {
    case 'error':
      return errorsIn(report);
    case 'warning':
      return warningsIn(report);
    case 'all':
      // Errors first: they are the ones standing between the theme and a memory card.
      return [...errorsIn(report), ...warningsIn(report)];
  }
};

export const ValidationDock = ({
  report,
  assets,
  theme,
  onConvert,
  onConvertAll,
  onSelectIssue,
  onClose,
}: {
  readonly report: ValidationReport;
  readonly assets: readonly ThemeAssetSummary[];
  readonly theme: ThemeSnapshot;
  readonly onConvert: (slot: ThemeAssetSlot) => void;
  readonly onConvertAll: () => void;
  readonly onSelectIssue: (section: SectionId, assetPath: string | null) => void;
  readonly onClose: () => void;
}): ReactElement => {
  const [filter, setFilter] = useState<IssueFilter>('all');

  /** The inventory records where each file is used, which is what an issue is anchored to. */
  const assetAt = (location: string): string | null =>
    assets.find((summary) => summary.locations.includes(location))?.path ?? null;

  const errors = errorsIn(report).length;
  const warnings = warningsIn(report).length;
  const issues = orderedIssues(report, filter);
  const convertible = incompatibleImageSlots(theme.project, theme.assets);
  const imageCodes = new Set([
    'asset.wrong-image-format',
    'asset.wrong-dimensions',
    'asset.bit-depth-too-high',
    'asset.unexpected-transparency',
    'asset.not-indexed',
    'asset.extension-mismatch',
  ]);
  const fixFor = (issue: ValidationIssue): ThemeAssetSlot | null => {
    if (!imageCodes.has(issue.code)) return null;
    const path = assetAt(issue.location);
    return convertible.find((slot) => assetAtSlot(theme.project, slot) === path) ?? null;
  };

  return (
    <aside className="dock" aria-label="Validation">
      <div className="dock-head">
        <h2 className="dock-title">Validation</h2>
        <div className="dock-filters">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="toggle"
              aria-pressed={filter === entry.id}
              onClick={() => {
                setFilter(entry.id);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-quiet btn-icon btn-small dock-close"
          onClick={onClose}
          aria-label="Close validation details"
          title="Close validation details"
        >
          <CloseIcon />
        </button>
      </div>

      {convertible.length > 1 ? (
        <div className="dock-bulk-fix">
          <span>
            {String(convertible.length)} images can be converted together without stretching.
          </span>
          <button type="button" className="btn btn-small" onClick={onConvertAll}>
            Convert incompatible images…
          </button>
        </div>
      ) : null}

      {issues.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'Nothing to report' : `No ${filter}s`}
          hint={filter === 'all' ? 'Every rule this theme was checked against passed.' : undefined}
        />
      ) : (
        <ul className="dock-list">
          {issues.map((issue, index) => {
            const slot = fixFor(issue);
            const path = assetAt(issue.location);
            const summary = assets.find((asset) => asset.path === path);
            const media = summary?.lookup.status === 'found' ? summary.lookup.asset.media : null;
            const usage = slot === null ? null : assetSlotUsage(slot);
            const target =
              usage === null || usage === 'backgroundMusic' ? null : imageConversionTarget(usage);
            return (
              <li key={`${issue.code}:${issue.location}:${String(index)}`}>
                <button
                  type="button"
                  className="issue"
                  onClick={() => {
                    onSelectIssue(sectionForLocation(issue.location), assetAt(issue.location));
                  }}
                >
                  <span className="issue-mark" data-severity={issue.severity} />
                  <span className="issue-message">{issue.message}</span>
                  <span className="issue-meta">
                    <span>{issue.location}</span>
                    <span className="issue-meta-code">{issue.code}</span>
                  </span>
                </button>
                {slot !== null && target !== null && media?.kind === 'image' ? (
                  <div className="issue-fix">
                    <span>
                      {media.format.toUpperCase()} · {formatPixels(media.width, media.height)} → PNG
                      · {formatPixels(target.width, target.height)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        onConvert(slot);
                      }}
                    >
                      Convert…
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="dock-verdict">
        {hasErrors(report) ? (
          <>
            <span className="issue-mark" data-severity="error" />
            <span>
              Export is blocked by {formatCount(errors, 'error')}.
              {warnings > 0 ? ` ${formatCount(warnings, 'warning')} can be ignored.` : ''}
            </span>
          </>
        ) : (
          <>
            <span className={warnings > 0 ? 'verdict-warning' : 'verdict-ok'}>
              {warnings > 0 ? (
                <span className="issue-mark" data-severity="warning" />
              ) : (
                <CheckIcon />
              )}
            </span>
            <span>
              {warnings > 0 ? 'Export is allowed.' : 'Ready to export.'}
              {warnings > 0
                ? ` ${formatCount(warnings, 'warning')} — none of them blocks an export.`
                : ''}
            </span>
          </>
        )}
      </div>
    </aside>
  );
};
