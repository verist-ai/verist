// SPDX-License-Identifier: Apache-2.0

import {
  err,
  isBlockingCommand,
  ok,
  type Command,
  type Result,
} from "@verist/core";
import { hashValue } from "@verist/replay";
import type {
  CommitParams,
  RunStore,
  StateSnapshot,
  StorageError,
} from "@verist/storage";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import {
  veristBlocks,
  veristEvents,
  veristOutbox,
  veristState,
} from "./schema.ts";

export interface PgAdapterConfig {
  /**
   * Drizzle Postgres database instance.
   * Use drizzle(pool) or drizzle(client) from drizzle-orm/node-postgres.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: PgDatabase<any>;
}

/**
 * Outbox command status.
 *
 * Terminal states: dispatched, rejected, failed.
 * - dispatched: successfully enqueued to queue
 * - rejected: review was denied, command will not dispatch
 * - failed: explicit operator action (reserved, not used for transient errors)
 *
 * Transient dispatch errors rely on lease expiry for retry — entries remain
 * leased until expiry, then become eligible for re-lease.
 */
export type OutboxStatus =
  | "pending"
  | "deferred"
  | "leased"
  | "dispatched"
  | "rejected"
  | "failed";

/**
 * Outbox entry for command dispatch.
 */
export interface OutboxEntry {
  id: string;
  workflowId: string;
  runId: string;
  stepId: string;
  command: Command;
  dedupeKey: string;
  status: OutboxStatus;
  lastError: string | null;
  createdAt: Date;
}

/**
 * Block type discriminator.
 */
export type BlockType = "review" | "suspend";

/**
 * Active block (review or suspend).
 */
export interface Block {
  id: string;
  workflowId: string;
  runId: string;
  stepId: string;
  type: BlockType;
  reason: string;
  payload: unknown;
  resumeStep: string | null;
  createdAt: Date;
}

/**
 * Resolution for a review block.
 * Review is a pure gate — it approves or rejects deferred commands.
 * Use setOverlay() separately if human corrections are needed.
 */
export interface ReviewResolution {
  approved: boolean;
}

/**
 * Resolution for a suspend block.
 */
export interface SuspendResolution {
  resumeData: unknown;
}

/**
 * Result of resolving a block.
 * Returns null if block was already resolved or never existed (idempotent).
 */
export interface ResolvedBlock {
  id: string;
  type: BlockType;
  resolution: ReviewResolution | SuspendResolution;
}

/**
 * Extended Postgres store with outbox and block operations.
 */
export interface PgRunStore extends RunStore {
  /**
   * Get active block for a run (if any).
   */
  getBlock(
    workflowId: string,
    runId: string,
  ): Promise<Result<Block | null, StorageError>>;

  /**
   * Resolve a block (review or suspend).
   * For review: transitions deferred commands to pending or rejected.
   * For suspend: creates invoke command for resume step.
   *
   * Returns the resolved block, or null if already resolved (idempotent).
   */
  resolveBlock(
    workflowId: string,
    runId: string,
    resolution: ReviewResolution | SuspendResolution,
  ): Promise<Result<ResolvedBlock | null, StorageError>>;

  /**
   * Lease pending outbox entries for dispatch.
   * Uses SELECT FOR UPDATE SKIP LOCKED for concurrency safety.
   */
  leaseOutbox(
    leaseOwner: string,
    limit: number,
    leaseDurationMs?: number,
  ): Promise<Result<OutboxEntry[], StorageError>>;

  /**
   * Mark outbox entry as dispatched.
   * Only succeeds if the entry is leased by the specified owner.
   */
  markDispatched(
    outboxId: string,
    leaseOwner: string,
  ): Promise<Result<void, StorageError>>;

  /**
   * Mark outbox entry as failed.
   * Only succeeds if the entry is leased by the specified owner.
   */
  markFailed(
    outboxId: string,
    leaseOwner: string,
    error: string,
  ): Promise<Result<void, StorageError>>;
}

/**
 * Compute deterministic dedupe key for a command.
 *
 * Key is hash(workflowId, runId, stepId, command). Identical commands
 * from the same step execution produce the same key — this is intentional
 * for idempotency. If you need distinct commands with identical payloads,
 * include a distinguishing field in the command itself.
 *
 * Hash uses stableStringify (sorted object keys) for determinism regardless
 * of property insertion order.
 */
async function computeDedupeKey(
  workflowId: string,
  runId: string,
  stepId: string,
  command: Command,
): Promise<string> {
  const hash = await hashValue({ workflowId, runId, stepId, command });
  return hash.replace("sha256:", "");
}

// Postgres error code for unique constraint violation
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Map Postgres errors to StorageError with appropriate reason.
 *
 * Handles constraint violations by name to provide typed conflict reasons.
 * This ensures races (e.g., concurrent run creation) return `conflict` with
 * proper `reason` instead of masquerading as `connection_error`.
 */
function mapPgError(cause: unknown): StorageError {
  const message = cause instanceof Error ? cause.message : String(cause);

  // Drizzle wraps Postgres errors; extract the inner error.
  const pgError = (cause as { cause?: { code?: string; constraint?: string } })
    ?.cause;
  const code = pgError?.code;
  const constraint = pgError?.constraint;

  // Also check message for constraint name (some Drizzle versions)
  const isUniqueViolation =
    code === PG_UNIQUE_VIOLATION || message.includes("duplicate key");

  if (isUniqueViolation) {
    // Primary key on verist_state — concurrent run creation race
    if (
      constraint === "verist_state_pkey" ||
      message.includes("verist_state_pkey")
    ) {
      return {
        code: "conflict",
        reason: "run_exists",
        message: "run already exists (concurrent create)",
      };
    }
    // Partial unique index — at most one active block per run
    if (
      constraint === "verist_blocks_active_idx" ||
      message.includes("verist_blocks_active_idx")
    ) {
      return {
        code: "conflict",
        reason: "active_block",
        message: "run already has an active block",
      };
    }
    // Outbox dedupe index — command with same key already exists
    if (
      constraint === "verist_outbox_dedupe_idx" ||
      message.includes("verist_outbox_dedupe_idx")
    ) {
      return {
        code: "conflict",
        reason: "command_exists",
        message: "command with same dedupe key already exists",
      };
    }
  }

  return { code: "connection_error", message };
}

/**
 * Create Postgres RunStore implementing atomic state + event + outbox commits.
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
export function createPgRunStore(config: PgAdapterConfig): PgRunStore {
  const { db } = config;

  return {
    async load<T = unknown>(
      workflowId: string,
      runId: string,
    ): Promise<Result<StateSnapshot<T> | null, StorageError>> {
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

    async commit<T>(
      params: CommitParams<T>,
    ): Promise<Result<StateSnapshot<T>, StorageError>> {
      const {
        workflowId,
        runId,
        stepId,
        expectedVersion,
        delta,
        events,
        commands,
      } = params;

      try {
        // Use transaction for atomic state + events + outbox commit
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (db as any).transaction(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (tx: PgTransaction<any, any, any>) => {
            const now = new Date();

            // Validate at most one blocking command per step
            const blockingCommands = commands?.filter(isBlockingCommand) ?? [];
            if (blockingCommands.length > 1) {
              return err({
                code: "serialization_error",
                message: `Step returned ${blockingCommands.length} blocking commands (review/suspend); at most one allowed`,
              });
            }
            const blockingCommand = blockingCommands[0];

            // Command status depends on blocking command type:
            // - review: sibling commands are deferred until approval
            // - suspend: sibling commands are not written (workflow pauses)
            // - none: commands are pending immediately
            const commandStatus =
              blockingCommand?.type === "review" ? "deferred" : "pending";
            const shouldWriteCommands = blockingCommand?.type !== "suspend";

            let stateRow: typeof veristState.$inferSelect;

            if (expectedVersion === 0) {
              // New run: INSERT directly, constraint handles race.
              // mapPgError converts PK violation to conflict/run_exists.
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
              stateRow = row;
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
                    reason: "version_mismatch",
                    message: `expected version ${expectedVersion}, got ${existingRow.version}`,
                  });
                }

                return err({
                  code: "not_found",
                  message: `Run not found: ${workflowId}/${runId} (expectedVersion was ${expectedVersion}, not 0)`,
                });
              }
              stateRow = row;
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

            // Write blocking command to blocks table
            if (blockingCommand) {
              await tx.insert(veristBlocks).values({
                workflowId,
                runId,
                stepId,
                type: blockingCommand.type,
                reason: blockingCommand.reason,
                payload:
                  blockingCommand.type === "review"
                    ? (blockingCommand.payload ?? null)
                    : (blockingCommand.checkpoint ?? null),
                resumeStep:
                  blockingCommand.type === "suspend"
                    ? (blockingCommand.resumeStep ?? stepId)
                    : null,
                createdAt: now,
              });
            }

            // Write commands to outbox (if not suspend, which discards siblings)
            if (commands && commands.length > 0 && shouldWriteCommands) {
              // Filter out blocking commands from outbox (they go to blocks table)
              const outboxCommands = commands.filter(
                (cmd) => !isBlockingCommand(cmd),
              );

              if (outboxCommands.length > 0) {
                const outboxEntries = await Promise.all(
                  outboxCommands.map(async (command) => ({
                    workflowId,
                    runId,
                    stepId,
                    command: command as unknown as Record<string, unknown>,
                    dedupeKey: await computeDedupeKey(
                      workflowId,
                      runId,
                      stepId,
                      command,
                    ),
                    status: commandStatus,
                    createdAt: now,
                  })),
                );

                // Validate no duplicate dedupe keys (step returned identical commands)
                const keys = outboxEntries.map((e) => e.dedupeKey);
                const uniqueKeys = new Set(keys);
                if (uniqueKeys.size !== keys.length) {
                  return err({
                    code: "serialization_error",
                    message: `Step returned duplicate commands (${keys.length} total, ${uniqueKeys.size} unique). Deduplicate in step or include a distinguishing field in each command.`,
                  });
                }

                await tx.insert(veristOutbox).values(outboxEntries);
              }
            }

            return ok({
              workflowId: stateRow.workflowId,
              runId: stateRow.runId,
              version: stateRow.version,
              computed: stateRow.computed as T,
              overlay: stateRow.overlay as Partial<T>,
              createdAt: stateRow.createdAt,
              updatedAt: stateRow.updatedAt,
            });
          },
        );
      } catch (cause) {
        return err(mapPgError(cause));
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

    async getBlock(
      workflowId: string,
      runId: string,
    ): Promise<Result<Block | null, StorageError>> {
      try {
        const rows = await db
          .select()
          .from(veristBlocks)
          .where(
            and(
              eq(veristBlocks.workflowId, workflowId),
              eq(veristBlocks.runId, runId),
              isNull(veristBlocks.resolvedAt),
            ),
          )
          .limit(1);

        const row = rows[0];
        if (!row) {
          return ok(null);
        }

        return ok({
          id: row.id.toString(),
          workflowId: row.workflowId,
          runId: row.runId,
          stepId: row.stepId,
          type: row.type as BlockType,
          reason: row.reason,
          payload: row.payload,
          resumeStep: row.resumeStep,
          createdAt: row.createdAt,
        });
      } catch (cause) {
        return err({
          code: "connection_error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },

    async resolveBlock(
      workflowId: string,
      runId: string,
      resolution: ReviewResolution | SuspendResolution,
    ): Promise<Result<ResolvedBlock | null, StorageError>> {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (db as any).transaction(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (tx: PgTransaction<any, any, any>) => {
            const now = new Date();

            // Get the block
            const blocks = await tx
              .select()
              .from(veristBlocks)
              .where(
                and(
                  eq(veristBlocks.workflowId, workflowId),
                  eq(veristBlocks.runId, runId),
                  isNull(veristBlocks.resolvedAt),
                ),
              )
              .limit(1);

            const block = blocks[0];
            if (!block) {
              // Idempotent: already resolved or never existed
              return ok(null);
            }

            // Validate resolution shape before any mutations
            if (typeof resolution !== "object" || resolution === null) {
              return err({
                code: "serialization_error",
                message: "Resolution must be an object",
              });
            }

            if (block.type === "review") {
              const reviewRes = resolution as ReviewResolution;
              if (typeof reviewRes.approved !== "boolean") {
                return err({
                  code: "serialization_error",
                  message: "Review resolution requires 'approved: boolean'",
                });
              }
              // Transition deferred commands based on approval.
              // Scoped to the block's stepId to avoid affecting commands from other steps.
              // Clear lease fields to ensure clean state (defensive against dirty data).
              await tx
                .update(veristOutbox)
                .set({
                  status: reviewRes.approved ? "pending" : "rejected",
                  leaseOwner: null,
                  leaseExpiresAt: null,
                })
                .where(
                  and(
                    eq(veristOutbox.workflowId, workflowId),
                    eq(veristOutbox.runId, runId),
                    eq(veristOutbox.stepId, block.stepId),
                    eq(veristOutbox.status, "deferred"),
                  ),
                );
              // Mark block as resolved after side effects succeed
              await tx
                .update(veristBlocks)
                .set({
                  resolution: resolution as unknown as Record<string, unknown>,
                  resolvedAt: now,
                })
                .where(eq(veristBlocks.id, block.id));
            } else if (block.type === "suspend") {
              if (!("resumeData" in resolution)) {
                return err({
                  code: "serialization_error",
                  message: "Suspend resolution requires 'resumeData' field",
                });
              }
              const suspendRes = resolution as SuspendResolution;
              // Normalize undefined to null for JSONB storage consistency
              if (suspendRes.resumeData === undefined) {
                (suspendRes as { resumeData: unknown }).resumeData = null;
              }
              // Create invoke command for resume step.
              // Uses synthetic stepId `resume:<blockId>` to distinguish from
              // regular step invocations — tooling should tolerate unknown stepIds.
              const resumeStep = block.resumeStep ?? block.stepId;
              const resumeInput = {
                checkpoint: block.payload,
                resumeData: suspendRes.resumeData,
              };
              const resumeCommand: Command = {
                type: "invoke",
                step: resumeStep,
                input: resumeInput,
              };

              const syntheticStepId = `resume:${block.id}`;
              const dedupeKey = await computeDedupeKey(
                workflowId,
                runId,
                syntheticStepId,
                resumeCommand,
              );

              // ON CONFLICT handles idempotent retries of resolveBlock
              await tx.execute(sql`
                INSERT INTO ${veristOutbox} (
                  workflow_id, run_id, step_id, command, dedupe_key, status, created_at
                ) VALUES (
                  ${workflowId}, ${runId}, ${syntheticStepId},
                  ${JSON.stringify(resumeCommand)}::jsonb, ${dedupeKey},
                  'pending', ${now}
                )
                ON CONFLICT (dedupe_key) DO NOTHING
              `);
              // Mark block as resolved after side effects succeed
              await tx
                .update(veristBlocks)
                .set({
                  resolution: resolution as unknown as Record<string, unknown>,
                  resolvedAt: now,
                })
                .where(eq(veristBlocks.id, block.id));
            }

            return ok({
              id: block.id.toString(),
              type: block.type as BlockType,
              resolution,
            });
          },
        );
      } catch (cause) {
        return err(mapPgError(cause));
      }
    },

    async leaseOutbox(
      leaseOwner: string,
      limit: number,
      leaseDurationMs = 30000,
    ): Promise<Result<OutboxEntry[], StorageError>> {
      try {
        const now = new Date();
        const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

        // Lease pending commands or reclaim expired/orphaned leases.
        // Also reclaim leased entries with NULL lease_expires_at (dirty data defense).
        // Using raw SQL for FOR UPDATE SKIP LOCKED
        const result = await db.execute(sql`
          UPDATE ${veristOutbox}
          SET
            status = 'leased',
            lease_owner = ${leaseOwner},
            lease_expires_at = ${leaseExpiresAt}
          WHERE id IN (
            SELECT id FROM ${veristOutbox}
            WHERE status = 'pending'
               OR (status = 'leased' AND (lease_expires_at IS NULL OR lease_expires_at < ${now}))
            ORDER BY created_at
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          RETURNING *
        `);

        const entries: OutboxEntry[] = (
          result.rows as Array<Record<string, unknown>>
        ).map((row) => {
          const createdAtRaw = row.created_at;
          return {
            id: String(row.id),
            workflowId: row.workflow_id as string,
            runId: row.run_id as string,
            stepId: row.step_id as string,
            command: row.command as Command,
            dedupeKey: row.dedupe_key as string,
            status: row.status as OutboxStatus,
            lastError: row.last_error as string | null,
            createdAt:
              createdAtRaw instanceof Date
                ? createdAtRaw
                : new Date(createdAtRaw as string),
          };
        });

        return ok(entries);
      } catch (cause) {
        return err({
          code: "connection_error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },

    async markDispatched(
      outboxId: string,
      leaseOwner: string,
    ): Promise<Result<void, StorageError>> {
      // Validate outboxId is numeric before BigInt() to avoid sync throw
      if (!/^\d+$/.test(outboxId)) {
        return err({
          code: "serialization_error",
          message: `Invalid outbox ID: ${outboxId}`,
        });
      }

      try {
        // Only allow the lease owner to finalize, prevents stale dispatcher races.
        // Clear lastError on success (stale from prior failed attempts).
        const result = await db
          .update(veristOutbox)
          .set({
            status: "dispatched",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            dispatchedAt: new Date(),
          })
          .where(
            and(
              eq(veristOutbox.id, BigInt(outboxId)),
              eq(veristOutbox.status, "leased"),
              eq(veristOutbox.leaseOwner, leaseOwner),
            ),
          )
          .returning({ id: veristOutbox.id });

        if (result.length === 0) {
          return err({
            code: "conflict",
            reason: "lease_mismatch",
            message: `Outbox entry ${outboxId} not finalizable by this owner`,
          });
        }

        return ok(undefined);
      } catch (cause) {
        return err(mapPgError(cause));
      }
    },

    /**
     * Mark outbox entry as failed (terminal state, reserved for operator use).
     *
     * The default dispatcher does not call this for transient errors — it lets
     * the lease expire for automatic retry. This method is for explicit operator
     * action or future error classification.
     *
     * Recovery requires manual intervention: delete the row or re-commit the step.
     */
    async markFailed(
      outboxId: string,
      leaseOwner: string,
      error: string,
    ): Promise<Result<void, StorageError>> {
      // Validate outboxId is numeric before BigInt() to avoid sync throw
      if (!/^\d+$/.test(outboxId)) {
        return err({
          code: "serialization_error",
          message: `Invalid outbox ID: ${outboxId}`,
        });
      }

      try {
        // Only allow the lease owner to finalize, prevents stale dispatcher races
        const result = await db
          .update(veristOutbox)
          .set({
            status: "failed",
            leaseOwner: null,
            leaseExpiresAt: null,
            failures: sql`${veristOutbox.failures} + 1`,
            lastError: error,
          })
          .where(
            and(
              eq(veristOutbox.id, BigInt(outboxId)),
              eq(veristOutbox.status, "leased"),
              eq(veristOutbox.leaseOwner, leaseOwner),
            ),
          )
          .returning({ id: veristOutbox.id });

        if (result.length === 0) {
          return err({
            code: "conflict",
            reason: "lease_mismatch",
            message: `Outbox entry ${outboxId} not finalizable by this owner`,
          });
        }

        return ok(undefined);
      } catch (cause) {
        return err(mapPgError(cause));
      }
    },
  };
}
