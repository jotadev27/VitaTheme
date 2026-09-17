/**
 * Explicit success/failure type.
 *
 * Parsing and validation run over untrusted, user-supplied theme data where a single
 * input can produce many independent problems. Exceptions would abort on the first one,
 * so failures are returned as values and accumulated instead.
 */
export type Result<TValue, TError> =
  { readonly ok: true; readonly value: TValue } | { readonly ok: false; readonly error: TError };

export const success = <TValue>(value: TValue): Result<TValue, never> => ({ ok: true, value });

export const failure = <TError>(error: TError): Result<never, TError> => ({ ok: false, error });

export const isSuccess = <TValue, TError>(
  result: Result<TValue, TError>,
): result is { readonly ok: true; readonly value: TValue } => result.ok;
