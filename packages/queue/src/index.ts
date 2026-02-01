// SPDX-License-Identifier: Apache-2.0

import { err, ok, type Result } from "@verist/core";

/**
 * Job to be enqueued for execution.
 *
 * Jobs are pointers, not payloads (Invariant #2: state lives in database).
 * The job identifies WHAT to execute; step input is loaded from state store.
 */
export interface Job {
  /** Unique job ID. Used for deduplication in BullMQ. */
  id: string;
  workflowId: string;
  workflowVersion: string;
  runId: string;
  stepId: string;
  /** Job priority (lower = higher priority). Default: 0 */
  priority?: number;
  /** Delay in milliseconds before job becomes available. */
  delay?: number;
}

/**
 * Options for job enqueue, typically used for retry/backoff configuration.
 */
export interface EnqueueOptions {
  /** Number of retry attempts on failure. Default: 3 */
  attempts?: number;
  /** Backoff strategy for retries. */
  backoff?: {
    type: "fixed" | "exponential";
    /** Delay in milliseconds. */
    delay: number;
  };
}

/**
 * Result of job execution.
 */
export interface JobResult {
  jobId: string;
  success: boolean;
  error?: string;
  completedAt: Date;
}

/**
 * Error codes for queue operations.
 *
 * Codes are adapter-specific; BullMQ adapter currently only returns
 * `connection_error`. Other codes are reserved for future adapters.
 *
 * Note: Duplicate jobs are silently accepted (not an error) since they're
 * expected in at-least-once delivery with deterministic dedupe keys.
 */
export type QueueErrorCode =
  | "connection_error"
  | "job_not_found"
  | "queue_full";

/**
 * Structured error for queue operations.
 */
export interface QueueError {
  code: QueueErrorCode;
  message: string;
}

/**
 * Job handler function type.
 * Handler receives a job pointer and loads input from state store.
 */
export type JobHandler = (job: Job) => Promise<void>;

/**
 * Queue adapter interface.
 * Manages job enqueueing and processing.
 */
export interface QueueAdapter {
  /**
   * Enqueue a job for execution.
   * Uses job.id for deduplication (duplicate jobs are silently ignored).
   */
  enqueue(
    job: Job,
    options?: EnqueueOptions,
  ): Promise<Result<void, QueueError>>;

  /**
   * Register a handler for processing jobs.
   * Returns a cleanup function to stop processing.
   */
  process(handler: JobHandler): Promise<() => Promise<void>>;

  /**
   * Close the queue connection gracefully.
   */
  close(): Promise<void>;
}

/**
 * Configuration for BullMQ queue adapter.
 */
export interface BullMQConfig {
  /** Redis connection URL or IORedis options. */
  connection: string | { host: string; port: number; password?: string };
  /** Queue name. */
  queueName: string;
  /** Optional key prefix for Redis keys. */
  prefix?: string;
  /** Default job options. */
  defaultJobOptions?: EnqueueOptions;
}

/**
 * Create a BullMQ-backed queue adapter.
 *
 * @example
 * ```typescript
 * import { createBullMQ } from "@verist/queue";
 *
 * const queue = createBullMQ({
 *   connection: "redis://localhost:6379",
 *   queueName: "verist-jobs",
 * });
 *
 * // Enqueue a job
 * await queue.enqueue({
 *   id: "dedupe-key-123",
 *   workflowId: "verify-document",
 *   workflowVersion: "1.0.0",
 *   runId: "run-456",
 *   stepId: "extract",
 * });
 *
 * // Process jobs
 * const stop = await queue.process(async (job) => {
 *   console.log("Processing", job.stepId, "for run", job.runId);
 *   // Load input from state store and execute step...
 * });
 *
 * // Later: stop processing
 * await stop();
 * await queue.close();
 * ```
 */
export function createBullMQ(config: BullMQConfig): QueueAdapter {
  // Dynamic import to keep bullmq optional
  let bullmqQueue: import("bullmq").Queue | null = null;
  let bullmqWorker: import("bullmq").Worker | null = null;
  let connectionOptions: import("ioredis").RedisOptions;

  // Parse connection string or use options directly
  if (typeof config.connection === "string") {
    const url = new URL(config.connection);
    connectionOptions = {
      host: url.hostname,
      port: parseInt(url.port || "6379", 10),
      password: url.password || undefined,
      maxRetriesPerRequest: null, // Required for BullMQ
    };
  } else {
    connectionOptions = {
      ...config.connection,
      maxRetriesPerRequest: null,
    };
  }

  const defaultOpts = config.defaultJobOptions ?? { attempts: 3 };

  async function getQueue(): Promise<import("bullmq").Queue> {
    if (!bullmqQueue) {
      const { Queue } = await import("bullmq");
      bullmqQueue = new Queue(config.queueName, {
        connection: connectionOptions,
        prefix: config.prefix,
      });
    }
    return bullmqQueue;
  }

  return {
    async enqueue(
      job: Job,
      options?: EnqueueOptions,
    ): Promise<Result<void, QueueError>> {
      try {
        const queue = await getQueue();
        const opts = { ...defaultOpts, ...options };

        // BullMQ job data - just the pointer fields
        const jobData = {
          workflowId: job.workflowId,
          workflowVersion: job.workflowVersion,
          runId: job.runId,
          stepId: job.stepId,
        };

        await queue.add(job.stepId, jobData, {
          jobId: job.id, // Dedupe key
          priority: job.priority,
          delay: job.delay,
          attempts: opts.attempts,
          backoff: opts.backoff,
          // Keep completed jobs for 1 hour to ensure deduplication during
          // "enqueue ok, markDispatched fail" window. BullMQ only deduplicates
          // by jobId while the job exists in Redis.
          removeOnComplete: { age: 3600 },
          removeOnFail: false, // Keep failed jobs for inspection
        });

        return ok(undefined);
      } catch (cause) {
        // BullMQ may throw JobExistsError when a job with same jobId is already
        // present in Redis. Treat as idempotent success (expected with at-least-once).
        const errorName = cause instanceof Error ? cause.name : "";
        const message = cause instanceof Error ? cause.message : String(cause);
        if (
          errorName === "JobExistsError" ||
          message.includes("Job already exists")
        ) {
          // Duplicate job — this is expected behavior, not an error
          return ok(undefined);
        }
        // All non-duplicate errors treated as connection_error.
        // Production adapters may want finer classification.
        return err({
          code: "connection_error",
          message,
        });
      }
    },

    async process(handler: JobHandler): Promise<() => Promise<void>> {
      const { Worker } = await import("bullmq");

      bullmqWorker = new Worker(
        config.queueName,
        async (bullmqJob) => {
          if (!bullmqJob.id) {
            throw new Error("BullMQ job missing id — cannot process");
          }
          const job: Job = {
            id: bullmqJob.id,
            workflowId: bullmqJob.data.workflowId,
            workflowVersion: bullmqJob.data.workflowVersion,
            runId: bullmqJob.data.runId,
            stepId: bullmqJob.data.stepId,
          };
          await handler(job);
        },
        {
          connection: connectionOptions,
          prefix: config.prefix,
        },
      );

      // Return cleanup function
      return async () => {
        if (bullmqWorker) {
          await bullmqWorker.close();
          bullmqWorker = null;
        }
      };
    },

    async close(): Promise<void> {
      if (bullmqWorker) {
        await bullmqWorker.close();
        bullmqWorker = null;
      }
      if (bullmqQueue) {
        await bullmqQueue.close();
        bullmqQueue = null;
      }
    },
  };
}
