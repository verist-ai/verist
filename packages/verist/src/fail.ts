// SPDX-License-Identifier: Apache-2.0

/**
 * Tagged failure value that steps can return instead of throwing.
 * Detected by `runStep()` and `recompute()` before output validation,
 * then converted to a structured `StepError` with the original code
 * and retryable flag preserved.
 */
export interface StepFailure {
  readonly _tag: "StepFailure";
  code: string;
  message: string;
  retryable?: boolean;
  cause?: unknown;
}

/**
 * Create a structured failure from a step.
 *
 * Two calling conventions:
 * - `fail(code, message, opts?)` — explicit fields
 * - `fail(error)` — from an error object (e.g., extract() error)
 *
 * @example
 * ```typescript
 * // From extract() error
 * const result = await extract(ctx, request, schema);
 * if (!result.ok) return fail(result.error);
 *
 * // Explicit
 * return fail("rate_limit", "Too many requests", { retryable: true });
 * ```
 */
export function fail(
  code: string,
  message: string,
  opts?: { retryable?: boolean; cause?: unknown },
): StepFailure;
export function fail(error: {
  code: string;
  message: string;
  retryable?: boolean;
  cause?: unknown;
}): StepFailure;
export function fail(
  codeOrError:
    | string
    | { code: string; message: string; retryable?: boolean; cause?: unknown },
  message?: string,
  opts?: { retryable?: boolean; cause?: unknown },
): StepFailure {
  if (typeof codeOrError === "string") {
    return {
      _tag: "StepFailure",
      code: codeOrError,
      message: message!,
      retryable: opts?.retryable,
      cause: opts?.cause,
    };
  }
  return {
    _tag: "StepFailure",
    code: codeOrError.code,
    message: codeOrError.message,
    retryable: codeOrError.retryable,
    cause: codeOrError.cause,
  };
}

/** Type guard for StepFailure. Used by runStep() and recompute(). */
export function isStepFailure(value: unknown): value is StepFailure {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v._tag === "StepFailure" &&
    typeof v.code === "string" &&
    typeof v.message === "string"
  );
}
