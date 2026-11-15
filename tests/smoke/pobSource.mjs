// Shared inputs for the smoke tests: where the Lua engine is, and a geared build.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePoBLayout } from '../../build/utils/pobLayout.js';

/**
 * The src/ the Lua process runs in. Resolved the same way the server resolves it,
 * so an installed PoB needs no configuration; POB_PATH still wins when set.
 */
export function smokePoBSrc() {
  const { src, kind } = resolvePoBLayout(process.env.POB_PATH || process.env.POB_FORK_PATH);
  if (!existsSync(join(src, 'HeadlessWrapper.lua'))) {
    throw new Error(
      `No PoB engine at ${src} (resolved as ${kind}). Install Path of Building, ` +
        `or set POB_PATH to the src directory of a checkout.`
    );
  }
  return src;
}

/**
 * How to launch the Lua engine: honours POB_CMD (including a .py launcher script)
 * and POB_PYTHON, exactly as the server does. Returns { cmd, args } with the given
 * script args appended after any launcher script.
 */
export async function smokeLaunch(scriptArgs) {
  const { resolveLuaCommand } = await import('../../build/utils/luaCommand.js');
  return resolveLuaCommand({ POB_CMD: process.env.POB_CMD, POB_PYTHON: process.env.POB_PYTHON }, scriptArgs);
}

/** A geared build the repo owns, so no smoke test needs a PoB checkout. */
export const gearedBuildXml = fileURLToPath(new URL('../fixtures/occ-vortex.xml', import.meta.url));
