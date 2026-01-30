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
