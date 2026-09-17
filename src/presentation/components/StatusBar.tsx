import type { ReactElement } from 'react';
import { errorsIn, warningsIn, type ValidationReport } from '@/domain/validation/report';
import type { ExportRecord } from '@/ipc';
import { formatByteSize, formatCount } from '../format';
import { AlertIcon, CheckIcon, RevealIcon } from './icons';

export const StatusBar = ({
  report,
  lastExport,
  onRevealExport,
  validationOpen,
  onToggleValidation,
}: {
  readonly report: ValidationReport | null;
  readonly lastExport: ExportRecord | null;
  readonly onRevealExport: () => void;
  readonly validationOpen: boolean;
  readonly onToggleValidation: () => void;
}): ReactElement => {
  const errors = report === null ? 0 : errorsIn(report).length;
  const warnings = report === null ? 0 : warningsIn(report).length;
  const verdict =
    errors > 0
      ? { severity: 'error' as const, label: 'Export blocked' }
      : warnings > 0
        ? { severity: 'warning' as const, label: 'Export allowed' }
        : { severity: 'ok' as const, label: 'Ready to export' };

  return (
    <footer className="status">
      {report === null ? (
        <span className="dim">No theme open</span>
      ) : (
        <button
          type="button"
          className="status-validation"
          aria-expanded={validationOpen}
          onClick={onToggleValidation}
          title={validationOpen ? 'Hide validation details' : 'Show validation details'}
        >
          <span className="status-verdict" data-severity={verdict.severity}>
            {verdict.severity === 'ok' ? <CheckIcon /> : <AlertIcon />}
            {verdict.label}
          </span>
          <span className="status-count numeric" data-severity={errors > 0 ? 'error' : 'ok'}>
            {formatCount(errors, 'error')}
          </span>
          <span className="dim">·</span>
          <span className="status-count numeric" data-severity={warnings > 0 ? 'warning' : 'ok'}>
            {formatCount(warnings, 'warning')}
          </span>
          <span className="status-details">{validationOpen ? 'Hide details' : 'View details'}</span>
        </button>
      )}

      <span className="status-spacer" />

      {lastExport === null ? null : (
        <span className="status-group">
          <span className="numeric">
            PS Vita export “{lastExport.name}” · {formatCount(lastExport.fileCount, 'file')} ·{' '}
            {formatByteSize(lastExport.totalBytes)}
          </span>
          <button type="button" className="btn btn-quiet btn-small" onClick={onRevealExport}>
            <RevealIcon />
            Show
          </button>
        </span>
      )}
    </footer>
  );
};
