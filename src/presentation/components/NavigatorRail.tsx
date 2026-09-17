import type { ReactElement } from 'react';
import type { ValidationIssue } from '@/domain/validation/issue';
import { formatByteSize, formatCount } from '../format';
import { PREVIEW_SURFACES, type PreviewSurfaceId } from '../preview/surfaces';
import { issuesInSection, SECTIONS, type SectionId } from '../state/sections';

/**
 * The parts of the theme, with what is wrong in each of them.
 *
 * Counting issues per section is what makes the list worth having: it says where to go next
 * without anyone having to read the whole report first.
 */
export const PreviewRail = ({
  surface,
  onSelect,
}: {
  readonly surface: PreviewSurfaceId;
  readonly onSelect: (surface: PreviewSurfaceId) => void;
}): ReactElement => (
  <nav className="rail" aria-label="Preview surfaces">
    {PREVIEW_SURFACES.map((entry) => (
      <button
        key={entry.id}
        type="button"
        className="rail-item"
        aria-current={entry.id === surface}
        onClick={() => {
          onSelect(entry.id);
        }}
      >
        <span className="rail-item-label">{entry.label}</span>
        <span className="rail-item-description">{entry.description}</span>
      </button>
    ))}

    <div className="rail-footer">
      A representation of the theme, not a reproduction of the console.
    </div>
  </nav>
);

export const NavigatorRail = ({
  section,
  issues,
  assetCount,
  totalBytes,
  onSelect,
}: {
  readonly section: SectionId;
  readonly issues: readonly ValidationIssue[];
  readonly assetCount: number;
  readonly totalBytes: number;
  readonly onSelect: (section: SectionId) => void;
}): ReactElement => (
  <nav className="rail" aria-label="Theme sections">
    {SECTIONS.map((entry) => {
      const sectionIssues = entry.id === 'assets' ? [] : issuesInSection(issues, entry.id);
      const errors = sectionIssues.filter((issue) => issue.severity === 'error').length;
      const warnings = sectionIssues.length - errors;
      const count = entry.id === 'assets' ? assetCount : errors + warnings;
      const severity = errors > 0 ? 'error' : warnings > 0 ? 'warning' : undefined;

      return (
        <button
          key={entry.id}
          type="button"
          className="rail-item"
          aria-current={entry.id === section}
          onClick={() => {
            onSelect(entry.id);
          }}
        >
          <span className="rail-item-label">{entry.label}</span>
          {count === 0 ? null : (
            <span
              className="count-pill"
              {...(severity === undefined || entry.id === 'assets'
                ? {}
                : { 'data-severity': severity })}
            >
              {count}
            </span>
          )}
          <span className="rail-item-description">{entry.description}</span>
        </button>
      );
    })}

    <div className="rail-footer numeric">
      {formatCount(assetCount, 'file')} · {formatByteSize(totalBytes)}
    </div>
  </nav>
);
