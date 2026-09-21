import type { McpToolResult } from '../mcp/contracts/shared.types.js'

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

export type AgentEvent =
	| AgentMessageEvent
	| AgentStatusEvent
	| AgentToolEvent

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
