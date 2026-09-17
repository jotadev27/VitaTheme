import type { ValidationIssue } from './issue';

/** The outcome of validating a theme: every problem found, in a stable order. */
export interface ValidationReport {
  readonly issues: readonly ValidationIssue[];
}

export const validationReport = (issues: readonly ValidationIssue[]): ValidationReport => ({
  issues,
});

export const errorsIn = (report: ValidationReport): readonly ValidationIssue[] =>
  report.issues.filter((candidate) => candidate.severity === 'error');

export const warningsIn = (report: ValidationReport): readonly ValidationIssue[] =>
  report.issues.filter((candidate) => candidate.severity === 'warning');

export const hasErrors = (report: ValidationReport): boolean =>
  report.issues.some((candidate) => candidate.severity === 'error');

/**
 * A theme may only be exported once it has no errors. Warnings are advisory and never block
 * the author: several of them cover rules the format does not document with certainty.
 */
export const isExportable = (report: ValidationReport): boolean => !hasErrors(report);
