---
"@verist/cli": patch
---

Fix missing shebang in built CLI binary and add `--label` filter to `test` and `diff` commands

- `dist/cli.js` now starts with `#!/usr/bin/env node` so `npx verist` works correctly
- `--label <name>` filters baselines in `verist test` and `verist diff`, matching existing `replay` behavior
