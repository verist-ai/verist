// SPDX-License-Identifier: Apache-2.0

import { Command, Option } from "commander";
import { pathToFileURL } from "node:url";
import { EXIT_ERROR } from "./exitCodes.ts";

const program = new Command();

/** Commander collect helper for repeatable options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Reusable --format option with validation. */
function formatOption(): Option {
  return new Option("--format <mode>", "output format")
    .choices(["text", "json", "markdown"])
    .default("text");
}

program
  .name("verist")
  .description(
    "CLI for Verist workflows — replay, diff, and inspect AI decisions",
  )
  .version("0.0.1")
  .option("--debug", "show full error details")
  .option("--quiet", "suppress non-essential output");

program
  .command("init")
  .description("Scaffold a working Verist project (no API keys needed)")
  .action(async () => {
    const { initCommand } = await import("./commands/init.ts");
    await initCommand();
  });

program
  .command("capture")
  .description("Run a step against input files and save baselines")
  .requiredOption("--step <name>", "step name to execute")
  .requiredOption("--input <glob>", "glob pattern for input JSON files")
  .option("--workflow <id>", "workflow identifier (defaults to step name)")
  .option("--version <ver>", 'workflow version (defaults to "0.0.0")')
  .option("--label <text>", "human-readable label for the baseline")
  .option("--commands", "capture commands (default: true)", true)
  .option("--no-commands", "skip capturing commands")
  .option("--sample <n>", "randomly sample n inputs from the glob")
  .option("--seed <n>", "seed for deterministic sampling (default: 0)")
  .option("--meta <key=value>", "attach metadata (repeatable)", collect, [])
  .action(async (opts) => {
    const { capture } = await import("./commands/capture.ts");
    await capture(opts, program.opts());
  });

program
  .command("diff")
  .description("Recompute baselines and show diffs (exploratory)")
  .option("--step <name>", "step name to recompute")
  .option("--baseline <path>", "path to specific baseline file or directory")
  .option("--workflow <id>", "workflow identifier for auto-resolution")
  .option("--version <ver>", "workflow version for auto-resolution")
  .option("--label <name>", "filter by metadata label")
  .addOption(formatOption())
  .option(
    "--meta <key=value>",
    "filter baselines by metadata (repeatable)",
    collect,
    [],
  )
  .action(async (opts) => {
    const { diffCommand } = await import("./commands/diff.ts");
    await diffCommand(opts, program.opts());
  });

program
  .command("replay")
  .description("Inspect baselines and verify hash integrity")
  .option("--step <name>", "filter by step name")
  .option("--label <name>", "filter by metadata label")
  .option("--baseline <path>", "specific file or directory")
  .option("--workflow <id>", "workflow identifier")
  .option("--version <ver>", "workflow version")
  .option("--verify", "recompute hashes and check integrity")
  .option(
    "--meta <key=value>",
    "filter baselines by metadata (repeatable)",
    collect,
    [],
  )
  .action(async (opts) => {
    const { replayCommand } = await import("./commands/replay.ts");
    await replayCommand(opts, program.opts());
  });

program
  .command("test")
  .description("Recompute baselines and fail on diffs (CI mode)")
  .option("--step <name>", "step name to recompute")
  .option("--baseline <path>", "path to specific baseline file or directory")
  .option("--workflow <id>", "workflow identifier for auto-resolution")
  .option("--version <ver>", "workflow version for auto-resolution")
  .option("--label <name>", "filter by metadata label")
  .addOption(formatOption())
  .option(
    "--meta <key=value>",
    "filter baselines by metadata (repeatable)",
    collect,
    [],
  )
  .option("--no-fail-on-diff", "exit 0 even when diffs are detected")
  .option("--no-fail-on-commands-diff", "ignore command diffs for exit code")
  .action(async (opts) => {
    const { testCommand } = await import("./commands/test.ts");
    await testCommand(opts, program.opts());
  });

export async function run(
  args: string[] = process.argv.slice(2),
): Promise<void> {
  program.exitOverride();
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error: unknown) {
    if (error !== null && typeof error === "object" && "exitCode" in error) {
      process.exitCode = (error as { exitCode: number }).exitCode;
      return;
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT_ERROR;
  }
}

// Auto-run when executed as a script
if (
  import.meta.main ??
  (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
) {
  run();
}
