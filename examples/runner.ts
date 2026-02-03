/**
 * Example Verist runner demonstrating the execution loop.
 *
 * This file shows how to wire up:
 * - Step execution with atomic state + outbox commits
 * - Outbox dispatcher with lease-based concurrency safety
 * - BullMQ integration for job processing
 *
 * This is reference code, not a production-ready runtime.
 * Copy and adapt for your specific needs.
 */

import {
  run,
  type Step,
  type StepContext,
  type StepResult,
} from "@verist/core";
import { createBullMQ, type Job, type QueueAdapter } from "@verist/queue";
import { effectiveState } from "@verist/storage";
import {
  createPgRunStore,
  type OutboxEntry,
  type PgRunStore,
} from "@verist/storage-pg";

/**
 * Error that BullMQ treats as unrecoverable (won't retry, goes to dead-letter).
 * BullMQ checks `error.name === "UnrecoverableError"` to detect this.
 * In production, you can import { UnrecoverableError } from "bullmq" directly.
 */
class UnrecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrecoverableError";
  }
}

// ============================================================================
// Configuration
// ============================================================================

export interface RunnerConfig {
  /** Postgres connection for state storage. */
  store: PgRunStore;
  /** BullMQ queue adapter. */
  queue: QueueAdapter;
  /** Step registry: stepId -> Step definition. */
  steps: Map<string, Step<unknown, unknown>>;
  /** Adapters to inject into step context. */
  adapters: Record<string, unknown>;
  /**
   * Workflow version for audit.
   * Note: This is runner-level config. In production, you may want per-run
   * versioning stored in state/events to handle deploys mid-execution.
   */
  workflowVersion: string;
  /** Unique identifier for this dispatcher instance (for lease ownership). */
  dispatcherId?: string;
}

// ============================================================================
// Step Execution
// ============================================================================

/**
 * Execute a step and commit results atomically.
 *
 * **Input semantics:** This runner uses effective state as step input. Steps
 * define input schemas that match the state slice they need. The invoke
 * command's input field is for documentation/audit, not runtime routing.
 *
 * Alternative runners could load input from the command by looking up the
 * outbox entry via `job.id` (which is the command's dedupe key).
 *
 * Flow:
 * 1. Check for active blocks (skip if blocked)
 * 2. Load current state from store
 * 3. Run the step with effective state as input
 * 4. Commit delta + events + commands in one transaction
 *
 * The outbox ensures commands are persisted atomically with state.
 * A separate dispatcher process reads the outbox and enqueues to BullMQ.
 *
 * @returns Step result, or null if skipped due to active block
 * @throws Error for transient failures (BullMQ will retry)
 * @throws UnrecoverableError for permanent failures (goes to dead-letter)
 */
export async function executeStep(
  config: RunnerConfig,
  job: Job,
): Promise<StepResult<unknown, unknown> | null> {
  const { store, steps, adapters, workflowVersion } = config;
  const { workflowId, runId, stepId } = job;

  // Check for active blocks — skip execution if workflow is blocked.
  // This prevents wasted work; commands won't dispatch anyway while blocked.
  const blockResult = await store.getBlock(workflowId, runId);
  if (!blockResult.ok) {
    // Can't determine block status — retry to avoid executing while blocked
    throw new Error(
      `Failed to check block status: ${blockResult.error.message}`,
    );
  }
  if (blockResult.value) {
    // Job dropped: workflow is blocked. When the block resolves, new commands
    // will be created (suspend→resume) or deferred commands will become
    // pending (review→approve). No need to retry this job.
    const block = blockResult.value;
    console.log(
      `Job dropped: ${workflowId}/${runId}/${stepId} blocked by ${block.type} (block: ${block.id}, job: ${job.id})`,
    );
    return null;
  }

  // Get step definition
  const step = steps.get(stepId);
  if (!step) {
    throw new UnrecoverableError(`Unknown step: ${stepId}`);
  }

  // Load current state
  const loadResult = await store.load(workflowId, runId);
  if (!loadResult.ok) {
    throw new Error(`Failed to load state: ${loadResult.error.message}`);
  }

  const snapshot = loadResult.value;
  const currentVersion = snapshot?.version ?? 0;

  // Build effective state (computed + overlay merge).
  // Cast needed: generic runner works with unknown state shapes.
  type State = Record<string, unknown>;
  const state = effectiveState({
    computed: (snapshot?.computed ?? {}) as State,
    overlay: (snapshot?.overlay ?? {}) as Partial<State>,
  });

  // Build context
  const context: StepContext = {
    adapters,
    workflowId,
    workflowVersion,
    runId,
  };

  // Run the step
  const result = await run(step, state, context);

  if (!result.ok) {
    // Step validation or execution failed — throw so BullMQ retries
    throw new Error(`Step ${stepId} failed: ${result.error.message}`);
  }

  const stepResult = result.value;

  // Commit delta + events + commands atomically
  const commitResult = await store.commit({
    workflowId,
    runId,
    stepId,
    expectedVersion: currentVersion,
    delta: stepResult.output.delta,
    events: stepResult.output.events,
    commands: stepResult.output.commands,
  });

  if (!commitResult.ok) {
    const { code, reason, message } = commitResult.error;

    // Categorize errors by whether retry can help
    if (code === "connection_error") {
      // Transient DB error — retry
      throw new Error(`Transient error: ${message}`);
    }
    if (code === "conflict") {
      // Storage adapters must set reason for conflict errors (contract).
      // Fail fast if violated — silent retry loops are worse than crashes.
      if (!reason) {
        throw new UnrecoverableError(
          `Conflict without reason (adapter bug): ${message}`,
        );
      }
      // command_exists means step already committed successfully (duplicate delivery).
      // Return null to indicate "already processed" — don't return stepResult from
      // this execution since it may differ from what was actually committed.
      // Note: the step may have re-executed (side effects) before this commit attempt.
      // Proper queue deduplication (removeOnComplete retention) prevents this.
      if (reason === "command_exists") {
        console.log(
          `Step ${stepId} already committed for ${workflowId}/${runId} (duplicate delivery)`,
        );
        return null;
      }
      // version_mismatch is transient (concurrent update, retry may help)
      // Other conflicts are permanent (retrying won't change outcome)
      const isPermanent = reason === "run_exists" || reason === "active_block";
      if (isPermanent) {
        throw new UnrecoverableError(`Conflict (${reason}): ${message}`);
      }
      throw new Error(`Conflict (${reason}): ${message}`);
    }
    // Permanent failures — don't retry
    if (code === "serialization_error") {
      throw new UnrecoverableError(`Invalid step result: ${message}`);
    }
    if (code === "not_found") {
      throw new UnrecoverableError(`Invalid job pointer: ${message}`);
    }
    // Unknown error code — treat as permanent to avoid infinite retries
    throw new UnrecoverableError(`Unknown error (${code}): ${message}`);
  }

  console.log(
    `Step ${stepId} completed for ${workflowId}/${runId} (v${commitResult.value.version})`,
  );

  return stepResult;
}

// ============================================================================
// Outbox Dispatcher
// ============================================================================

/**
 * Dispatch pending commands from outbox to queue.
 *
 * Uses lease-based concurrency control:
 * - Lease commands with SELECT FOR UPDATE SKIP LOCKED
 * - Enqueue to BullMQ with dedupe key as job ID
 * - Mark as dispatched on success; on transient errors, let lease expire
 *
 * Safe to run multiple dispatcher instances concurrently.
 */
export async function dispatchOutbox(
  config: RunnerConfig,
  batchSize = 100,
  leaseDurationMs = 30000,
): Promise<number> {
  const { store, queue, workflowVersion } = config;
  const dispatcherId = config.dispatcherId ?? `dispatcher-${process.pid}`;

  // Lease pending commands
  const leaseResult = await store.leaseOutbox(
    dispatcherId,
    batchSize,
    leaseDurationMs,
  );

  if (!leaseResult.ok) {
    console.error(`Failed to lease outbox: ${leaseResult.error.message}`);
    return 0;
  }

  const entries = leaseResult.value;
  if (entries.length === 0) {
    return 0;
  }

  console.log(`Leased ${entries.length} outbox entries`);

  let dispatched = 0;

  for (const entry of entries) {
    try {
      const cmd = entry.command;

      // Handle emit commands directly (side effect, not step execution).
      // This example runner logs the emit; real implementations should
      // publish to the appropriate message broker.
      //
      // Note: emit has at-least-once semantics. If markDispatched fails after
      // the side effect, retry/recovery may cause duplicate emits. Handlers
      // should use dedupeKey for idempotency.
      if (cmd.type === "emit") {
        console.log(
          `Emit to ${cmd.topic}: ${JSON.stringify(cmd.payload)} (dedupeKey: ${entry.dedupeKey})`,
        );
        const markResult = await store.markDispatched(entry.id, dispatcherId);
        if (!markResult.ok) {
          // lease_mismatch: entry not finalizable by this owner
          if (markResult.error.reason === "lease_mismatch") {
            console.log(`Lease lost for ${entry.id}; skipping`);
            continue;
          }
          throw new Error(markResult.error.message);
        }
        dispatched++;
        continue;
      }

      // Build job from outbox entry (invoke/fanout commands)
      const job: Job = {
        id: entry.dedupeKey, // Deterministic dedupe key
        workflowId: entry.workflowId,
        workflowVersion,
        runId: entry.runId,
        stepId: extractStepId(entry),
      };

      // Enqueue to BullMQ
      const enqueueResult = await queue.enqueue(job);

      if (!enqueueResult.ok) {
        throw new Error(enqueueResult.error.message);
      }

      // Mark as dispatched.
      // lease_mismatch means entry not finalizable by this owner (reclaimed,
      // already finalized, etc). Job may be enqueued twice but deduped by ID.
      const markResult = await store.markDispatched(entry.id, dispatcherId);
      if (!markResult.ok) {
        if (markResult.error.reason === "lease_mismatch") {
          console.log(`Lease lost for ${entry.id}; skipping`);
          continue;
        }
        throw new Error(markResult.error.message);
      }

      dispatched++;
    } catch (error) {
      // UnrecoverableError from extractStepId means unknown command type —
      // this is an invariant violation (code/schema drift), not a dispatch failure.
      // Rethrow to crash the dispatcher loudly; don't paper over with markFailed.
      if (error instanceof UnrecoverableError) {
        throw error;
      }

      // Enqueue failed (likely transient: Redis blip, network hiccup).
      // Don't terminalize — just log and let the lease expire. The entry
      // will be retried on the next dispatch cycle.
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to dispatch ${entry.id}: ${errorMessage}`);
    }
  }

  console.log(`Dispatched ${dispatched}/${entries.length} commands`);
  return dispatched;
}

/**
 * Extract target step ID from outbox command.
 * Only handles invoke/fanout; emit is handled directly in dispatcher.
 */
function extractStepId(entry: OutboxEntry): string {
  const cmd = entry.command;
  if (cmd.type === "invoke") {
    return cmd.step;
  }
  if (cmd.type === "fanout") {
    return cmd.step;
  }
  // Fail fast for unknown command types rather than silently enqueueing wrong step
  throw new UnrecoverableError(
    `Cannot extract stepId from unknown command type: ${cmd.type}`,
  );
}

// ============================================================================
// Runner Loop
// ============================================================================

/**
 * Start the runner loop.
 *
 * This combines:
 * - BullMQ worker for processing jobs (step execution)
 * - Periodic outbox dispatcher
 *
 * Returns a cleanup function to stop the runner.
 */
export async function startRunner(
  config: RunnerConfig,
  options: {
    /** Interval for outbox dispatch in ms. Default: 1000 */
    dispatchInterval?: number;
  } = {},
): Promise<() => Promise<void>> {
  const { dispatchInterval = 1000 } = options;

  // Start job processor
  const stopProcessor = await config.queue.process(async (job) => {
    await executeStep(config, job);
  });

  // Start outbox dispatcher loop
  let dispatcherRunning = true;
  const dispatcherLoop = async () => {
    while (dispatcherRunning) {
      try {
        await dispatchOutbox(config);
      } catch (error) {
        console.error("Dispatcher error:", error);
      }
      await sleep(dispatchInterval);
    }
  };

  // Run dispatcher in background
  const dispatcherPromise = dispatcherLoop();

  // Return cleanup function
  return async () => {
    dispatcherRunning = false;
    await stopProcessor();
    await dispatcherPromise;
    await config.queue.close();
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Example Usage
// ============================================================================

/**
 * Example: Set up and run a simple workflow.
 *
 * Prerequisites:
 * - Postgres database with Verist schema
 * - Redis for BullMQ
 *
 * Run migrations first:
 *   npx drizzle-kit push
 */
export async function exampleUsage() {
  // This is example code - import these in your actual implementation
  const { defineStep, invoke } = await import("@verist/core");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const { z } = await import("zod");

  // Database setup
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const store = createPgRunStore({ db });

  // Queue setup
  const queue = createBullMQ({
    connection: process.env.REDIS_URL ?? "redis://localhost:6379",
    queueName: "verist-example",
  });

  // Define steps.
  //
  // Note: This runner passes effective state as step input. Steps should define
  // input schemas that match the state slice they need.
  //
  // The invoke command's input field serves as documentation/audit — it records
  // what the step expected to receive, even though this runner reads from state.
  const extractStep = defineStep({
    name: "extract",
    input: z.object({ documentId: z.string() }),
    delta: z.object({ claims: z.array(z.string()) }),
    run: async (input) => {
      // Simulate extraction
      const claims = [`Claim from ${input.documentId}`];
      return {
        delta: { claims },
        events: [
          { type: "claims_extracted", payload: { count: claims.length } },
        ],
        // Next step reads claims from state; input here is for audit/documentation
        commands: [invoke("verify", { claims })],
      };
    },
  });

  const verifyStep = defineStep({
    name: "verify",
    input: z.object({ claims: z.array(z.string()) }),
    delta: z.object({ verified: z.boolean() }),
    run: async (input) => {
      // Simulate verification
      return {
        delta: { verified: input.claims.length > 0 },
        events: [{ type: "claims_verified" }],
      };
    },
  });

  // Build step registry
  const steps = new Map<string, Step<unknown, unknown>>([
    ["extract", extractStep as Step<unknown, unknown>],
    ["verify", verifyStep as Step<unknown, unknown>],
  ]);

  // Start runner
  const config: RunnerConfig = {
    store,
    queue,
    steps,
    adapters: {},
    workflowVersion: "1.0.0",
  };

  const stop = await startRunner(config);

  // Enqueue initial job
  await queue.enqueue({
    id: "initial-extract-job",
    workflowId: "document-verification",
    workflowVersion: "1.0.0",
    runId: `run-${Date.now()}`,
    stepId: "extract",
  });

  console.log("Runner started. Press Ctrl+C to stop.");

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await stop();
    await pool.end();
    process.exit(0);
  });
}

// Uncomment to run the example:
// exampleUsage().catch(console.error);
