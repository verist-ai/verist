// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";

/**
 * Partial state update. Use for step output deltas.
 * Allows returning only changed fields.
 */
export type Delta<T> = Partial<T>;

/**
 * Infer TypeScript type from Zod schema.
 * Convenience re-export of z.infer.
 */
export type Infer<T extends z.ZodType> = z.infer<T>;

/**
 * Base constraint for adapter objects.
 * Allows any object shape - users define their own adapter interfaces.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BaseAdapters = {};

/**
 * Conditional type that makes `adapters` optional when TAdapters is empty.
 * Used by RunOptions and RecomputeOptions to avoid `adapters: {}` boilerplate.
 */
export type AdaptersOption<TAdapters extends BaseAdapters> = [
  keyof TAdapters,
] extends [never]
  ? { adapters?: TAdapters }
  : { adapters: TAdapters };

/**
 * Rest-tuple type that makes the options argument optional when TAdapters is
 * empty, and required when the step declares adapters. Used as `...args` in
 * function signatures to get conditional optionality without overloads.
 */
export type OptionsArg<TAdapters extends BaseAdapters, TOptions> = [
  keyof TAdapters,
] extends [never]
  ? [options?: TOptions]
  : [options: TOptions];
