// SPDX-License-Identifier: Apache-2.0

import type { BaseAdapters, Step } from "@verist/core";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * CLI configuration loaded from `verist.config.ts` or `verist.config.mjs`.
 */
export interface VeristConfig {
  steps: Record<string, Step<unknown, unknown>>;
  adapters: BaseAdapters;
}

/** Detect if running under Bun. */
export function isBun(): boolean {
  return typeof globalThis.Bun !== "undefined";
}

/**
 * Load Verist configuration from the project root.
 *
 * Searches for `verist.config.ts` (Bun) or `verist.config.mjs` (Node/Bun).
 * On Node, `.mjs` is preferred — `.ts` requires Bun.
 */
export async function loadConfig(cwd?: string): Promise<VeristConfig> {
  const dir = resolve(cwd ?? process.cwd());

  // Prefer the config format native to the current runtime
  const filenames = isBun()
    ? ["verist.config.ts", "verist.config.mjs"]
    : ["verist.config.mjs", "verist.config.ts"];

  let configPath: string | undefined;
  for (const filename of filenames) {
    const candidate = join(dir, filename);
    if (existsSync(candidate)) {
      configPath = candidate;
      break;
    }
  }

  if (!configPath) {
    throw new Error(
      `No config file found. Create one of: ${filenames.join(", ")}`,
    );
  }

  // Node.js cannot import .ts files directly
  if (configPath.endsWith(".ts") && !isBun()) {
    throw new Error(
      `Cannot import ${configPath} — TypeScript configs require Bun. ` +
        `Use verist.config.mjs for Node.js, or run with Bun.`,
    );
  }

  const mod = await import(configPath);
  const config = mod.default ?? mod;

  if (!config || typeof config !== "object") {
    throw new Error(
      `Config file must export an object with { steps, adapters }. Got: ${typeof config}`,
    );
  }

  if (!config.steps || typeof config.steps !== "object") {
    throw new Error(
      `Config must export "steps" as a Record<string, Step>. Missing or invalid "steps" field.`,
    );
  }

  if (!config.adapters || typeof config.adapters !== "object") {
    throw new Error(
      `Config must export "adapters" as an object. Pass an empty object {} if no adapters are needed.`,
    );
  }

  return config as VeristConfig;
}
