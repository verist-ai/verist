import type { Result } from "@verist/core";

/**
 * Job to be enqueued for execution.
 *
 * Jobs are pointers, not payloads (Invariant #2: state lives in database).
 * The job identifies WHAT to execute; step input is loaded from state store.
 */
export interface Job {
  id: string;
  workflowId: string;
  workflowVersion: string;
  runId: string;
  stepId: string;
  priority?: number;
  delay?: number;
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
   */
  enqueue(job: Job): Promise<Result<void, QueueError>>;

  /**
   * Register a handler for processing jobs.
   * Returns a cleanup function to stop processing.
   */
  process(
    workflowId: string,
    stepId: string,
    handler: JobHandler,
  ): Promise<() => Promise<void>>;
}

/**
 * Configuration for BullMQ queue adapter.
 */
export interface BullMQConfig {
  redisUrl: string;
  prefix?: string;
}

/**
 * Create a BullMQ-backed queue adapter.
 * @placeholder Implementation pending
 */
export function createBullMQ(_config: BullMQConfig): QueueAdapter {
  throw new Error("@verist/queue: BullMQ adapter not yet implemented");
}
