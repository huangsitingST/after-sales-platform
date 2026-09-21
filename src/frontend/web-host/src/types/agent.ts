export type IdentityToken = "token-blue-service" | "token-blue-finance";
// | 'token-star-service'

export interface AgentSessionInfo {
	sessionId: string
	model: string
	toolCount: number
}

export interface ToolResult {
	isError?: boolean
	content?: Array<{
		type: string
		text?: string
	}>
	structuredContent?: unknown
}

export type AgentEvent =
	| {
			id: string
			type: 'message'
			role: 'user' | 'assistant'
			text: string
	  }
	| {
			id: string
			type: 'status'
			text: string
			done?: boolean
	  }
	| {
			id: string
			type: 'tool'
			name: string
			args: Record<string, unknown>
			status: 'running' | 'complete' | 'error'
			result?: ToolResult
			error?: string
	  }
export type AgentRunResponse =
	| {
			kind: 'completed'
			events: AgentEvent[]
	  }
	| {
			kind: 'confirmation_required'
			confirmationId: string
			message: string
			events: AgentEvent[]
	  }

export interface ConnectionState {
	status: 'connecting' | 'connected' | 'error'
	text: string
}
