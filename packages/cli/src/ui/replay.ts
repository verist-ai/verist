// SPDX-License-Identifier: Apache-2.0

import type { BaselineEnvelope } from "../baseline/index.ts";

interface VerificationResult {
  valid: boolean;
  mismatches: Array<{
    kind: string;
    expected: string;
    actual: string;
  }>;
  checked: number;
  skipped: number;
}

/**
 * Format a single baseline entry for the replay command.
 */
export function formatReplayEntry(
  filename: string,
  envelope: BaselineEnvelope,
  verification?: VerificationResult,
): string {
  const { snapshot, metadata } = envelope;
  const lines: string[] = [];

  lines.push(`\u2500 ${filename}`);
  lines.push(`  Step:      ${snapshot.stepName}`);
  lines.push(
    `  Workflow:  ${snapshot.workflowId} @ ${snapshot.workflowVersion}`,
  );
  lines.push(`  Captured:  ${new Date(snapshot.capturedAt).toISOString()}`);
  lines.push(`  Input:     ${snapshot.inputHash}`);

  if (metadata.label) {
    lines.push(`  Label:     ${metadata.label}`);
  }

  // Artifacts summary
  if (snapshot.artifacts.length > 0) {
    lines.push(`  Artifacts:`);
    for (const artifact of snapshot.artifacts) {
      const hasContent =
        artifact.content !== undefined ? "(has content)" : "(hash only)";
      lines.push(
        `    ${artifact.kind.padEnd(15)} ${artifact.hash}  ${hasContent}`,
      );
    }
  }

  // Events summary from step-output artifact
  const stepOutput = snapshot.artifacts.find((a) => a.kind === "step-output");
  if (stepOutput?.content && typeof stepOutput.content === "object") {
    const output = stepOutput.content as { events?: unknown };
    if (Array.isArray(output.events)) {
      if (output.events.length === 0) {
        lines.push(`  Events:    0`);
      } else {
        const events = output.events as Array<{
          type: string;
          llmTrace?: { model: string; inputHash: string; outputHash: string };
        }>;
        // Count by type
        const typeCounts = new Map<string, number>();
        for (const event of events) {
          typeCounts.set(event.type, (typeCounts.get(event.type) ?? 0) + 1);
        }
        const countStr = Array.from(typeCounts.entries())
          .map(([type, count]) => `${type}: ${count}`)
          .join(", ");
        lines.push(`  Events:    ${events.length} total (${countStr})`);

        // LLM trace summary
        for (const event of events) {
          if (event.llmTrace) {
            lines.push(
              `    LLM:     ${event.llmTrace.model} (input: ${event.llmTrace.inputHash}, output: ${event.llmTrace.outputHash})`,
            );
          }
        }
      }
    } else {
      lines.push(`  Events:    (unrecognized step-output shape)`);
    }
  }

  // Verification result
  if (verification) {
    const counts = `${verification.checked} checked${verification.skipped > 0 ? `, ${verification.skipped} hash-only skipped` : ""}`;
    if (verification.valid && verification.checked === 0) {
      lines.push(
        `  Verify:    \u2713 no content to verify (hash-only baseline)`,
      );
    } else if (verification.valid) {
      lines.push(`  Verify:    \u2713 all hashes valid (${counts})`);
    } else {
      for (const m of verification.mismatches) {
        lines.push(
          `  Verify:    \u2717 hash mismatch on ${m.kind} (expected ${m.expected}, got ${m.actual})`,
        );
      }
      lines.push(`             (${counts})`);
    }
  }

  return lines.join("\n");
}

/**
 * Format the replay summary footer.
 */
export function formatReplaySummary(
  total: number,
  verified?: number,
  mismatches?: number,
): string {
  const parts: string[] = [`${total} baseline(s)`];
  if (verified !== undefined) {
    parts.push(`${verified} verified`);
  }
  if (mismatches !== undefined && mismatches > 0) {
    parts.push(`${mismatches} with hash mismatches`);
  }
  return parts.join(", ");
}
