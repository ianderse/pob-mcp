import fs from "fs/promises";
import { resolveBuildFile } from "./pathSanitizer.js";
import { noteIgnoredError } from "./errorHandling.js";

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

/**
 * Load `buildName` into the Lua bridge unless that same build is already
 * loaded — reloading an identical build would reset the live spec/item-set
 * selection. Matches on name or basename (path prefixes differ by caller).
 */
export async function loadBuildIfDifferent(
  luaClient: { getBuildInfo(): Promise<{ name?: string } | undefined>; loadBuildXml(xml: string, name: string, path: string): Promise<unknown> },
  buildName: string,
  buildsDir: string
): Promise<void> {
  const strip = (n: string) => n.replace(/\.xml$/i, '');
  const basename = (n: string) => n.split(/[/\\]/).pop() ?? n;
  let needsLoad = true;
  try {
    const info = await luaClient.getBuildInfo();
    const loaded = strip(info?.name ?? '');
    const requested = strip(buildName);
    if (loaded && (loaded === requested || basename(loaded) === basename(requested))) {
      needsLoad = false; // same build — keep current Lua state
    }
  } catch (e) { noteIgnoredError("no build loaded yet", e); }

  if (needsLoad) {
    const buildXml = await readNamedBuild(buildName, buildsDir);
    await luaClient.loadBuildXml(buildXml, buildName, resolveBuildFile(buildName, buildsDir));
  }
}
