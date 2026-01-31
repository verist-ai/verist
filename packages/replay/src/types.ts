/**
 * Classification of what an artifact represents.
 *
 * **Reserved by kernel:** `"step-output"` — used by `loadOutput`, `recompute`,
 * `compareSnapshots`. Only the first `step-output` artifact is used.
 *
 * **User-defined:** Any other value (e.g., `"llm-input"`, `"llm-output"`) is
 * opaque metadata for audit/tracing. The kernel does not interpret these.
 */
export type ArtifactKind = "step-output" | (string & {});

/**
 * A captured non-deterministic value with its content hash.
 * Artifacts enable exact replay by storing values that would otherwise vary.
 */
export interface Artifact {
  /** SHA-256 hash of the content */
  hash: string;
  /** @see ArtifactKind */
  kind: ArtifactKind;
  /** The actual content. Optional for compliance scenarios where content cannot be persisted. */
  content?: unknown;
}

/**
 * A point-in-time capture of step execution.
 * Contains input, output, and artifacts for verification and recomputation.
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
  /**
   * Diff between original and recomputed delta (state change only, not events).
   * `undefined` if original is unavailable for comparison (hash-only or missing).
   */
  diff: DiffResult | undefined;
  /** Captured artifact of the recomputed output (when captureArtifacts option is set) */
  outputArtifact?: Artifact;
}
