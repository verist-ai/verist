// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isBun } from "../config.ts";

/**
 * `verist init` — scaffold a working project with no API keys needed.
 *
 * Creates a deterministic `parse-contact` step that extracts name, email,
 * and phone from text via regex — demonstrating capture → test without LLM.
 */
export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const useBun = isBun();

  // Check if config already exists
  const configTs = join(cwd, "verist.config.ts");
  const configMjs = join(cwd, "verist.config.mjs");
  if (existsSync(configTs) || existsSync(configMjs)) {
    console.log("Verist config already exists. Nothing to do.");
    return;
  }

  const configFile = useBun ? "verist.config.ts" : "verist.config.mjs";
  const configPath = join(cwd, configFile);

  // Write config
  writeFileSync(configPath, useBun ? CONFIG_TS : CONFIG_MJS);
  console.log(`Created ${configFile}`);

  // Write sample input
  const inputDir = join(cwd, "verist", "inputs");
  mkdirSync(inputDir, { recursive: true });
  const samplePath = join(inputDir, "sample.json");
  writeFileSync(samplePath, SAMPLE_INPUT);
  console.log("Created verist/inputs/sample.json");

  // Print next steps
  console.log(`
Next steps:

  verist capture --step parse-contact --input "verist/inputs/*.json"
  verist test --step parse-contact
`);
}

const STEP_BODY = `\
import { defineStep } from "@verist/core";
import { z } from "zod";

const parseContact = defineStep({
  name: "parse-contact",
  input: z.object({ text: z.string() }),
  delta: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  run: async (input) => {
    const nameMatch = input.text.match(/(?:name|contact)[:\\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i);
    const emailMatch = input.text.match(/[\\w.+-]+@[\\w-]+\\.[\\w.]+/);
    const phoneMatch = input.text.match(/\\+?\\d[\\d\\s()-]{7,}/);

    return {
      delta: {
        name: nameMatch?.[1] ?? null,
        email: emailMatch?.[0] ?? null,
        phone: phoneMatch?.[0]?.replace(/\\s+/g, "") ?? null,
      },
      events: [{ type: "contact_parsed" }],
    };
  },
});`;

const CONFIG_TS = `\
${STEP_BODY}

export default {
  steps: { "parse-contact": parseContact },
  adapters: {},
};
`;

const CONFIG_MJS = `\
// @ts-check
${STEP_BODY}

export default {
  steps: { "parse-contact": parseContact },
  adapters: {},
};
`;

const SAMPLE_INPUT =
  JSON.stringify(
    {
      text: "Contact: Jane Smith, email jane.smith@example.com, phone +1 (555) 867-5309",
    },
    null,
    2,
  ) + "\n";
