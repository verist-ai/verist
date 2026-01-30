/**
 * Prepublish script run before `changeset publish`:
 * 1. Replaces `workspace:*` with actual versions (npm doesn't understand workspace protocol)
 * 2. Copies LICENSE to each package
 */

import { readdirSync } from "fs";
import { join } from "path";

const scriptsDir = import.meta.dir;
const rootDir = join(scriptsDir, "..");
const packagesDir = join(rootDir, "packages");
const licenseFile = join(rootDir, "LICENSE");

const packages = readdirSync(packagesDir).filter((name) => {
  try {
    return Bun.file(join(packagesDir, name, "package.json")).size > 0;
  } catch {
    return false;
  }
});

// Build version map: @verist/foo -> 1.2.3
const versionMap = new Map<string, string>();
for (const pkg of packages) {
  const pkgPath = join(packagesDir, pkg, "package.json");
  const pkgJson = JSON.parse(await Bun.file(pkgPath).text());
  versionMap.set(pkgJson.name, pkgJson.version);
}

const depFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

for (const pkg of packages) {
  const pkgPath = join(packagesDir, pkg, "package.json");
  const pkgJson = JSON.parse(await Bun.file(pkgPath).text());

  let updated = false;

  // Replace workspace:* with actual versions
  for (const field of depFields) {
    const deps = pkgJson[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== "string" || !range.startsWith("workspace:"))
        continue;
      const version = versionMap.get(name);
      if (!version) {
        console.warn(`⚠ Unknown workspace dep: ${name}`);
        continue;
      }
      const prefix = range.replace("workspace:", ""); // ^, ~, or *
      deps[name] = prefix === "*" ? version : `${prefix}${version}`;
      updated = true;
    }
  }

  if (updated) {
    await Bun.write(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
    console.log(`✓ Updated ${pkgJson.name}`);
  }

  // Copy LICENSE to package (npm only includes files from package dir)
  try {
    const license = await Bun.file(licenseFile).text();
    await Bun.write(join(packagesDir, pkg, "LICENSE"), license);
  } catch {
    console.warn(`⚠ Failed to copy LICENSE for ${pkgJson.name}`);
  }
}

console.log("\n✓ Prepublish complete");
