/**
 * Response Utilities
 *
 * Utilities for formatting and processing MCP tool responses
 */

export type ToolResponse = {
  content: Array<{
    type: string;
    text: string;
  }>;
};

/**
 * Truncate response text if it exceeds a reasonable limit for Claude Desktop.
 * This prevents timeouts and reduces token usage when responses are too large.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 5000 to minimize tokens)
 * @returns Truncated text with helpful message if truncated
 */
export function truncateResponse(text: string, maxLength: number = 5000): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.substring(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');
  const safeText = lastNewline > 0 ? truncated.substring(0, lastNewline) : truncated;

  const remaining = text.length - safeText.length;
  const remainingLines = text.substring(safeText.length).split('\n').length;

  return safeText + `\n\n[Response truncated: ${remaining} characters, ~${remainingLines} lines remaining]\n` +
         `[Use more specific queries to see detailed information]`;
}

/**
 * Wrap handler result with truncation for large responses
 *
 * @param result - The handler result to wrap
 * @param maxLength - Maximum length before truncation (default: 5000 to minimize tokens)
 * @returns The result with text truncated if needed
 */
export function wrapWithTruncation(
  result: ToolResponse,
  maxLength: number = 5000
): ToolResponse {
  if (result.content[0] && result.content[0].type === 'text') {
    result.content[0].text = truncateResponse(result.content[0].text, maxLength);
  }
  return result;
}

/**
 * Format time difference in human-readable format
 *
 * @param ms - Milliseconds elapsed
 * @returns Human-readable time string (e.g., "5m ago", "2h ago")
 */
export function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  return `${hours}h ago`;
}
