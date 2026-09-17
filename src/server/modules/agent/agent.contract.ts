import type { McpToolResult } from '../mcp/contracts/shared.types.js'

export interface AgentAppPayload {
	resourceUri: string
	html: string
	toolName: string
	args: Record<string, unknown>
	result: McpToolResult
	csp?: Record<string, unknown>
	permissions?: Record<string, unknown>
}

export interface AgentMessageEvent {
	id: string
	type: 'message'
	role: 'user' | 'assistant'
	text: string
}

export interface AgentStatusEvent {
	id: string
	type: 'status'
	text: string
	done?: boolean
}

export interface AgentToolEvent {
	id: string
	type: 'tool'
	name: string
	args: Record<string, unknown>
	status: 'running' | 'complete' | 'error'
	result?: McpToolResult
	error?: string
}

export interface AgentAppEvent {
	id: string
	type: 'app'
	app: AgentAppPayload
}

export type AgentEvent =
	| AgentMessageEvent
	| AgentStatusEvent
	| AgentToolEvent
	| AgentAppEvent

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

export interface CreateAgentSessionInput {
	token: string
}

export interface AgentSessionInfo {
	sessionId: string
	model: string
	toolCount: number
}

export interface AgentMessageInput {
	message: string
}

export interface AgentConfirmationInput {
	accepted: boolean
}
