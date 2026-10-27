import fs from "fs/promises";
import { resolveBuildFile } from "./pathSanitizer.js";

/**
 * Read a named build, failing loudly when it does not exist.
 *
 * Swallowing the miss and continuing with whatever the Lua bridge holds reports
 * another build's numbers under the requested name, with no error.
 */
export async function readNamedBuild(buildName: string, buildsDir?: string): Promise<string> {
  if (!buildsDir) {
    throw new Error(`Cannot resolve build "${buildName}": no builds directory configured.`);
  }

  const buildPath = resolveBuildFile(buildName, buildsDir);
  try {
    return await fs.readFile(buildPath, "utf-8");
  } catch {
    throw new Error(
      `Build "${buildName}" not found in ${buildsDir}. ` +
      `Use list_builds for available names, or omit build_name to use the build already loaded in the Lua bridge.`
    );
  }
}
