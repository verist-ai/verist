import { err, ok, type Result } from "@verist/core";
import type {
  CommitParams,
  RunStore,
  StateSnapshot,
  StorageError,
} from "@verist/storage";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import { veristEvents, veristState } from "./schema.ts";

export interface PgAdapterConfig {
  /**
   * Drizzle Postgres database instance.
   * Use drizzle(pool) or drizzle(client) from drizzle-orm/node-postgres.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: PgDatabase<any>;
}

/**
 * Create Postgres RunStore implementing atomic state + event commits.
 *
 * @example
 * import { drizzle } from "drizzle-orm/node-postgres";
 * import { Pool } from "pg";
 * import { createPgRunStore } from "@verist/storage-pg";
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 * const store = createPgRunStore({ db });
 */
export function createPgRunStore(config: PgAdapterConfig): RunStore {
  const { db } = config;

  return {
    async load(
      workflowId: string,
      runId: string,
    ): Promise<Result<StateSnapshot | null, StorageError>> {
      try {
        const rows = await db
          .select()
          .from(veristState)
          .where(
            and(
              eq(veristState.workflowId, workflowId),
              eq(veristState.runId, runId),
            ),
          )
          .limit(1);

        const row = rows[0];
        if (!row) {
          return ok(null);
        }

        return ok({
          workflowId: row.workflowId,
          runId: row.runId,
          version: row.version,
          computed: row.computed as Record<string, unknown>,
          overlay: row.overlay as Partial<Record<string, unknown>>,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      } catch (cause) {
        return err({
          code: "connection_error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },

    async commit<T>(
      params: CommitParams<T>,
    ): Promise<Result<StateSnapshot<T>, StorageError>> {
      const { workflowId, runId, stepId, expectedVersion, delta, events } =
        params;

      try {
        // Use transaction for atomic state + events commit
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (db as any).transaction(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (tx: PgTransaction<any, any, any>) => {
            const now = new Date();

            if (expectedVersion === 0) {
              // New run: check if exists first, then insert
              const existing = await tx
                .select({ version: veristState.version })
                .from(veristState)
                .where(
                  and(
                    eq(veristState.workflowId, workflowId),
                    eq(veristState.runId, runId),
                  ),
                )
                .limit(1);

              if (existing[0]) {
                return err({
                  code: "conflict",
                  message: `Run already exists: expectedVersion was 0 but run ${workflowId}/${runId} exists`,
                });
              }

              const result = await tx
                .insert(veristState)
                .values({
                  workflowId,
                  runId,
                  version: 1,
                  computed: delta as Record<string, unknown>,
                  overlay: {},
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();

              const row = result[0];
              if (!row) {
                return err({
                  code: "connection_error",
                  message: "Insert returned no rows",
                });
              }

              // Write events
              if (events.length > 0) {
                await tx.insert(veristEvents).values(
                  events.map((event) => ({
                    workflowId,
                    runId,
                    stepId,
                    type: event.type,
                    payload: event.payload ?? null,
                    llmTrace: event.llmTrace ?? null,
                    createdAt: now,
                  })),
                );
              }

              return ok({
                workflowId: row.workflowId,
                runId: row.runId,
                version: row.version,
                computed: row.computed as T,
                overlay: row.overlay as Partial<T>,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              });
            } else {
              // Existing run: update with version check
              const result = await tx
                .update(veristState)
                .set({
                  version: sql`${veristState.version} + 1`,
                  computed: sql`${veristState.computed} || ${JSON.stringify(delta)}::jsonb`,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(veristState.workflowId, workflowId),
                    eq(veristState.runId, runId),
                    eq(veristState.version, expectedVersion),
                  ),
                )
                .returning();

              const row = result[0];
              if (!row) {
                // Check if run exists with different version
                const existing = await tx
                  .select({ version: veristState.version })
                  .from(veristState)
                  .where(
                    and(
                      eq(veristState.workflowId, workflowId),
                      eq(veristState.runId, runId),
                    ),
                  )
                  .limit(1);

                const existingRow = existing[0];
                if (existingRow) {
                  return err({
                    code: "conflict",
                    message: `Version mismatch: expected ${expectedVersion}, got ${existingRow.version}`,
                  });
                }

                return err({
                  code: "not_found",
                  message: `Run not found: ${workflowId}/${runId} (expectedVersion was ${expectedVersion}, not 0)`,
                });
              }

              // Write events
              if (events.length > 0) {
                await tx.insert(veristEvents).values(
                  events.map((event) => ({
                    workflowId,
                    runId,
                    stepId,
                    type: event.type,
                    payload: event.payload ?? null,
                    llmTrace: event.llmTrace ?? null,
                    createdAt: now,
                  })),
                );
              }

              return ok({
                workflowId: row.workflowId,
                runId: row.runId,
                version: row.version,
                computed: row.computed as T,
                overlay: row.overlay as Partial<T>,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              });
            }
          },
        );
      } catch (cause) {
        return err({
          code: "connection_error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },

    async setOverlay<T>(
      workflowId: string,
      runId: string,
      overlay: Partial<T>,
    ): Promise<Result<StateSnapshot<T>, StorageError>> {
      try {
        const result = await db
          .update(veristState)
          .set({
            overlay: sql`${veristState.overlay} || ${JSON.stringify(overlay)}::jsonb`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(veristState.workflowId, workflowId),
              eq(veristState.runId, runId),
            ),
          )
          .returning();

        const row = result[0];
        if (!row) {
          return err({
            code: "not_found",
            message: `State not found: ${workflowId}/${runId}`,
          });
        }

        return ok({
          workflowId: row.workflowId,
          runId: row.runId,
          version: row.version,
          computed: row.computed as T,
          overlay: row.overlay as Partial<T>,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      } catch (cause) {
        return err({
          code: "connection_error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
}
