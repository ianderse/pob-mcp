import path from "path";

/**
 * PoB build files are always .xml, so a build name means the same thing with or
 * without the suffix. list_builds reports names with it; callers routinely omit it.
 */
export function buildFileName(name: string): string {
  return /\.xml$/i.test(name) ? name : `${name}.xml`;
}

/**
 * Resolve a build name to its file path inside the builds directory.
 * Normalizes the suffix first, then applies the full traversal checks below.
 */
export function resolveBuildFile(name: string, buildsDir: string): string {
  return sanitizeBuildName(buildFileName(name), buildsDir);
}

/**
 * Sanitize a build name to prevent path traversal attacks.
 * Returns the resolved absolute path within baseDir.
 * Throws on any path that would escape baseDir.
 */
export function sanitizeBuildName(name: string, baseDir: string): string {
  if (name.includes('\0')) {
    throw new Error('Build name contains null bytes');
  }

  if (path.isAbsolute(name)) {
    throw new Error('Build name must be relative');
  }

  // Reject .. components (both Unix and Windows separators)
  const normalized = name.replace(/\\/g, '/');
  if (normalized.split('/').some(segment => segment === '..')) {
    throw new Error('Build name contains path traversal');
  }

  const resolved = path.resolve(baseDir, name);
  const resolvedBase = path.resolve(baseDir);

  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error('Build name resolves outside base directory');
  }

  return resolved;
}
