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
 * Synchronous version of wrapHandler for non-async operations.
 *
 * @param action - A description of the action being performed
 * @param handler - The function to execute
 * @returns The result of the handler function
 * @throws {Error} A formatted error with context about the failed action
 */
export function wrapHandlerSync<T>(
  action: string,
  handler: () => T
): T {
  try {
    return handler();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ${action}: ${errorMsg}`);
  }
}
