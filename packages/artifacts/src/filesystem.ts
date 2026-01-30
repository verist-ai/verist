import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ok, err } from "@verist/core";
import type {
  ArtifactStore,
  ArtifactRef,
  Artifact,
  FilesystemConfig,
} from "./index.ts";

/**
 * Metadata stored alongside artifact content.
 */
interface ArtifactMetadata {
  hash: string; // "sha256:..." for verification
  size: number;
  contentType: string;
  createdAt: string; // ISO 8601
}

/**
 * Compute SHA-256 hash of content.
 * Returns full format: "sha256:<hex>"
 */
function computeHash(content: Uint8Array): string {
  const hex = createHash("sha256").update(content).digest("hex");
  return `sha256:${hex}`;
}

/**
 * Extract hex portion from full hash format.
 * "sha256:abc123" → "abc123"
 *
 * Throws on invalid format - callers should only pass hashes returned from put().
 */
function hashToFilename(hash: string): string {
  const match = hash.match(/^sha256:([a-f0-9]+)$/);
  if (!match?.[1]) throw new Error(`Invalid hash format: ${hash}`);
  return match[1];
}

/**
 * Check if error is ENOENT (file not found).
 */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Create a filesystem-backed artifact store.
 *
 * Directory structure:
 *   <basePath>/artifacts/<hex-hash>       - raw content
 *   <basePath>/artifacts/<hex-hash>.json  - metadata sidecar
 *
 * Content-addressable storage is naturally idempotent:
 * same content produces same hash, no race conditions.
 */
export function createFilesystem(config: FilesystemConfig): ArtifactStore {
  const artifactsDir = join(config.basePath, "artifacts");

  return {
    async put(content, contentType) {
      try {
        const hash = computeHash(content);
        const filename = hashToFilename(hash);
        const contentPath = join(artifactsDir, filename);
        const metadataPath = join(artifactsDir, `${filename}.json`);

        // Try reading existing metadata (idempotent - skip if already stored)
        try {
          const metadataJson = await readFile(metadataPath, "utf-8");
          const metadata: ArtifactMetadata = JSON.parse(metadataJson);
          return ok({
            hash: metadata.hash,
            size: metadata.size,
            contentType: metadata.contentType,
            createdAt: new Date(metadata.createdAt),
          });
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }

        // First write - ensure directory exists
        await mkdir(dirname(contentPath), { recursive: true });

        const now = new Date();
        const metadata: ArtifactMetadata = {
          hash,
          size: content.byteLength,
          contentType,
          createdAt: now.toISOString(),
        };

        // Write content before metadata (partial failure = no orphan metadata)
        await writeFile(contentPath, content);
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

        return ok({
          hash,
          size: content.byteLength,
          contentType,
          createdAt: now,
        });
      } catch (error) {
        return err({
          code: "storage_error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async get(hash) {
      try {
        const filename = hashToFilename(hash);
        const contentPath = join(artifactsDir, filename);
        const metadataPath = join(artifactsDir, `${filename}.json`);

        // Content is source of truth - try reading it first
        let content: Uint8Array;
        try {
          content = await readFile(contentPath);
        } catch (error) {
          if (isNotFound(error)) return ok(null);
          throw error;
        }

        // Content exists, verify hash
        const actualHash = computeHash(content);
        if (actualHash !== hash) {
          return err({
            code: "hash_mismatch",
            message: `Content corrupted: expected ${hash}, got ${actualHash}`,
          });
        }

        // Metadata is required for ArtifactRef; missing metadata = storage corruption
        const metadataJson = await readFile(metadataPath, "utf-8");
        const metadata: ArtifactMetadata = JSON.parse(metadataJson);

        const ref: ArtifactRef = {
          hash: metadata.hash,
          size: metadata.size,
          contentType: metadata.contentType,
          createdAt: new Date(metadata.createdAt),
        };

        return ok({ ref, content } as Artifact);
      } catch (error) {
        return err({
          code: "storage_error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
