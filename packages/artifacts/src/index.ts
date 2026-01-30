import type { Result } from "@verist/core";

/**
 * Reference to a stored artifact.
 * Content-addressable via hash.
 */
export interface ArtifactRef {
  hash: string;
  size: number;
  contentType: string;
  createdAt: Date;
}

/**
 * Artifact with content loaded.
 */
export interface Artifact {
  ref: ArtifactRef;
  content: Uint8Array;
}

/**
 * Error codes for artifact operations.
 */
export type ArtifactErrorCode = "not_found" | "storage_error" | "hash_mismatch";

/**
 * Structured error for artifact operations.
 */
export interface ArtifactError {
  code: ArtifactErrorCode;
  message: string;
}

/**
 * Immutable artifact storage interface.
 * Content-addressable storage for workflow artifacts.
 */
export interface ArtifactStore {
  /**
   * Store an artifact, returning its reference.
   * Hash is computed from content.
   */
  put(
    content: Uint8Array,
    contentType: string,
  ): Promise<Result<ArtifactRef, ArtifactError>>;

  /**
   * Retrieve an artifact by hash.
   */
  get(hash: string): Promise<Result<Artifact | null, ArtifactError>>;
}

/**
 * Configuration for filesystem artifact storage.
 */
export interface FilesystemConfig {
  basePath: string;
}

export { createFilesystem } from "./filesystem.ts";
