import type { ToolResult } from '../types/agent'

export function extractToolText(result: ToolResult) {
	return (
		result.content?.find((item) => item.type === 'text')?.text ??
		JSON.stringify(result.structuredContent ?? {})
	)
}

export function extractStructuredResult<T>(result: ToolResult): T {
	if (result.structuredContent) return result.structuredContent as T
	return JSON.parse(extractToolText(result)) as T
}
