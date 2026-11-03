/**
 * Error handling utilities
 *
 * Provides consistent error handling patterns across the codebase.
 */

/**
 * Wraps a handler function with standardized error handling.
 *
 * @param action - A description of the action being performed (e.g., "add item", "analyze build")
 * @param handler - The async function to execute
 * @returns The result of the handler function
 * @throws {Error} A formatted error with context about the failed action
 *
 * @example
 * ```typescript
 * export async function handleAddItem(context, itemText, slotName) {
 *   return wrapHandler('add item', async () => {
 *     await context.ensureLuaClient();
 *     // actual logic here
 *   });
 * }
 * ```
 */
export async function wrapHandler<T>(
  action: string,
  handler: () => Promise<T>
): Promise<T> {
  try {
    return await handler();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ${action}: ${errorMsg}`);
  }
}

/**
 * Record a deliberately swallowed, non-fatal error.
 *
 * Optional build context (live stats, item names, ninja data) degrades the
 * response rather than failing it, so those failures are caught and dropped —
 * but silently. This helper keeps the swallow honest: the reason and the
 * original message always reach the MCP log channel (stderr).
 *
 * @param context - what was being attempted and why failing it is acceptable
 * @param error - the caught value, logged verbatim
 *
 * @example
 * ```typescript
 * try { luaStats = await luaClient.getStats(); }
 * catch (e) { noteIgnoredError('live stats for context (file-only analysis still valid)', e); }
 * ```
 */
export function noteIgnoredError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[non-fatal] ${context}: ${message}`);
}
