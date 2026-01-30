/**
 * A captured non-deterministic value with its content hash.
 * Artifacts enable exact replay by storing values that would otherwise vary.
 */
export interface Artifact {
  /** SHA-256 hash of the content */
  hash: string;
  /** Classification of what this artifact represents */
  kind: "llm-input" | "llm-output" | "step-input" | "step-output" | string;
  /** The actual content. Optional for compliance scenarios where content cannot be persisted. */
  content?: unknown;
}

/**
 * A point-in-time capture of step execution inputs.
 * Snapshots contain everything needed to replay a step exactly.
 */
export interface Snapshot {
  /** Workflow identifier */
  workflowId: string;
  /** Workflow version at capture time */
  workflowVersion: string;
  /** Name of the step that was executed */
  stepName: string;
  /** Input passed to the step */
  input: unknown;
  /** Hash of the input for quick comparison */
  inputHash: string;
  /** Artifacts captured during execution */
  artifacts: Artifact[];
  /** Unix timestamp (ms) when snapshot was created */
  capturedAt: number;
}

/**
 * A single change between two values.
 */
export interface DiffEntry {
  /** Path to the changed value (array of keys/indices) */
  path: (string | number)[];
  /** Value before the change (undefined if added) */
  before: unknown;
  /** Value after the change (undefined if removed) */
  after: unknown;
}

/**
 * Result of comparing two values.
 */
export interface DiffResult {
  /** True if values are structurally equal */
  equal: boolean;
  /** List of differences (empty if equal) */
  entries: DiffEntry[];
}

/**
 * Options for capturing artifacts.
 */
export interface CaptureOptions {
  /** If true, omit content from artifact (hash only) */
  hashOnly?: boolean;
}

/**
 * Parameters for creating a snapshot.
 */
export interface CreateSnapshotParams {
  workflowId: string;
  workflowVersion: string;
  stepName: string;
  input: unknown;
  artifacts: Artifact[];
}

/**
 * Function type for retrieving artifacts by hash.
 * Used during replay to fetch stored artifact content.
 */
export type GetArtifact = (hash: string) => Promise<unknown> | unknown;

/**
 * Layered state structure for diff operations.
 * Compatible with @verist/storage LayeredState without coupling.
 */
export interface LayeredStateInput<T> {
  computed: T;
  overlay: Partial<T>;
}

/**
 * Result of recomputation including the diff from original.
 */
export interface RecomputeResult<T> {
  /** The recomputed output */
  output: T;
  /** Diff between original and recomputed output */
  diff: DiffResult;
  /** Captured artifact when captureArtifacts option is true */
  artifact?: Artifact;
}
