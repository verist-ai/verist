// SPDX-License-Identifier: Apache-2.0

/**
 * Result type for explicit error handling.
 * Discriminated union that works with TypeScript's type narrowing.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Create a successful result */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Create a failed result */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Extract value from result, throwing if error */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

/** Transform the success value of a result */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (result.ok) return ok(fn(result.value));
  return result;
}

/** Transform the error value of a result */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  if (!result.ok) return err(fn(result.error));
  return result;
}

/** Chain result-returning functions */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (result.ok) return fn(result.value);
  return result;
}

/** Check if result is successful (type guard) */
export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; value: T } {
  return result.ok;
}

/** Check if result is failed (type guard) */
export function isErr<T, E>(
  result: Result<T, E>,
): result is { ok: false; error: E } {
  return !result.ok;
}
