// Launches Vitest from the canonical project path.
//
// On Windows a terminal can start in "c:\..." instead of "C:\...". Vitest then
// loads two copies of itself (one per drive-letter casing) and every suite
// fails with "Cannot read properties of undefined (reading 'config')".
// Resolving the real path first and spawning Vitest from it avoids that.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";

const root = realpathSync.native(process.cwd());
const cli = join(root, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
