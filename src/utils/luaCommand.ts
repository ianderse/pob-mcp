/**
 * Resolve how to launch the Lua bridge from POB_CMD / POB_ARGS.
 *
 * - POB_ARGS may be a JSON array (`["C:\\My Files\\a.lua"]`), so paths containing
 *   spaces survive. Anything else is split on whitespace, as before.
 * - POB_CMD ending in `.py` is a Python launcher script (for example a shim that hosts
 *   PoB's own runtime/lua51.dll on Windows, which has no PoB-compatible luajit.exe). It
 *   is run with POB_PYTHON (default `python` on Windows, `python3` elsewhere).
 */
export interface LuaCommand {
  cmd: string;
  args: string[];
}

export function parseArgs(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`POB_ARGS looks like JSON but does not parse: ${(error as Error).message}`);
    }
    if (!Array.isArray(parsed) || !parsed.every((a) => typeof a === "string")) {
      throw new Error("POB_ARGS JSON must be an array of strings");
    }
    return parsed as string[];
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

export function resolveLuaCommand(
  env: Record<string, string | undefined>,
  defaultArgs: string[],
  platform: NodeJS.Platform = process.platform,
): LuaCommand {
  const args = parseArgs(env.POB_ARGS) ?? defaultArgs;
  const cmd = env.POB_CMD || "luajit";
  if (/\.py$/i.test(cmd)) {
    const python = env.POB_PYTHON || (platform === "win32" ? "python" : "python3");
    return { cmd: python, args: [cmd, ...args] };
  }
  return { cmd, args };
}
