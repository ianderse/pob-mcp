/**
 * Shared helpers for handler tests.
 */

/**
 * Render a ToolResponse's text parts as one string.
 *
 * Every handler returns `content: [{ type: 'text', text }]`; asserting against
 * the raw array makes tests depend on envelope shape they do not care about.
 */
export function textOf(result: { content: Array<{ text?: string }> }): string {
  return result.content.map((c) => c.text ?? '').join('');
}
