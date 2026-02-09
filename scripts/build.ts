// SPDX-License-Identifier: Apache-2.0

/**
 * Build script for all packages.
 * Bundles TypeScript → JavaScript with Bun.build, then
 * generates .d.ts declarations with tsc (emitDeclarationOnly).
 */

import { existsSync } from "fs";
import { join } from "path";

const rootDir = join(import.meta.dir, "..");
const packagesDir = join(rootDir, "packages");

// Build order: packages with no internal deps first
const buildOrder = ["verist", "storage", "cli", "llm", "storage-pg"];

console.log(`Building ${buildOrder.length} packages...\n`);

for (const pkg of buildOrder) {
  const pkgDir = join(packagesDir, pkg);
  const distDir = join(pkgDir, "dist");
  const pkgJsonPath = join(pkgDir, "package.json");

  if (!existsSync(pkgJsonPath)) {
    console.log(`⊘ ${pkg} (not found)`);
    continue;
  }

  // Read package.json to find all entry points
  const pkgJson = JSON.parse(await Bun.file(pkgJsonPath).text());
  const entrypoints: string[] = [];

  if (pkgJson.exports) {
    for (const exp of Object.values(pkgJson.exports) as Array<{
      bun?: string;
    }>) {
      if (typeof exp === "object" && exp.bun) {
        const srcPath = join(pkgDir, exp.bun);
        if (existsSync(srcPath)) {
          entrypoints.push(srcPath);
        }
      }
    }
  }

  if (entrypoints.length === 0) {
    console.log(`⊘ ${pkg} (no entrypoints)`);
    continue;
  }

  // Bundle JS with bun build
  const buildResult = await Bun.build({
    entrypoints,
    outdir: distDir,
    format: "esm",
    target: "node",
    packages: "external",
    sourcemap: "linked",
  });

  if (!buildResult.success) {
    console.error(`✗ ${pkg} (build failed)`);
    for (const log of buildResult.logs) {
      console.error("  ", log);
    }
    process.exit(1);
  }

  // Inject shebang for CLI bin entries (Bun.build doesn't add them)
  if (pkgJson.bin) {
    for (const binPath of Object.values(pkgJson.bin) as string[]) {
      const absPath = join(pkgDir, binPath);
      if (existsSync(absPath)) {
        const content = await Bun.file(absPath).text();
        if (!content.startsWith("#!")) {
          await Bun.write(absPath, `#!/usr/bin/env node\n${content}`);
        }
      }
    }
  }

  // Generate .d.ts declarations (tsc handles types, Bun handles JS)
  const tsc = Bun.spawn(["tsc", "-p", join(pkgDir, "tsconfig.json")], {
    stderr: "pipe",
  });
  const tscExit = await tsc.exited;
  if (tscExit !== 0) {
    const stderr = await new Response(tsc.stderr).text();
    console.error(`✗ ${pkg} (tsc)`);
    console.error(stderr);
    process.exit(1);
  }

  console.log(`✓ ${pkg}`);
}

console.log("\n✓ Build complete");
