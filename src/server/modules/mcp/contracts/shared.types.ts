export type UserRole = 'customer_service' | 'finance'

export interface Principal {
	userId: string
	name: string
	tenantId: string
	role: UserRole
}

export interface McpAuthInfo {
	token: string
	clientId: string
	scopes: string[]
}

export type ElicitationDecision = 'prompt' | 'accept' | 'decline'

export interface McpToolContent {
	type: string
	text?: string
}

export interface McpToolResult {
	isError?: boolean
	content?: McpToolContent[]
	structuredContent?: unknown
}

export interface McpToolDescriptor {
	name: string
	description?: string
	inputSchema?: Record<string, unknown>
	_meta?: {
		ui?: {
			resourceUri?: string
		}
	}
	[key: string]: unknown
}

export interface McpResourceContent {
	uri: string
	mimeType?: string
	text?: string
	blob?: string
	_meta?: Record<string, unknown>
}

export interface McpResourceResult {
	contents: McpResourceContent[]
}

export interface ModelMessage {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content?: string
	tool_call_id?: string
	tool_calls?: ModelToolCall[]
}

export interface ModelTool {
	type: 'function'
	function: {
		name: string
		description?: string
		parameters?: Record<string, unknown>
	}
}

export interface ModelToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string
	}
}
