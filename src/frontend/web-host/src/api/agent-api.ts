import type {
	AgentRunResponse,
	AgentSessionInfo,
	IdentityToken,
	RuntimeConfig
} from '../types/agent'
import { getJson, postJson } from './http'

export function getRuntimeConfig() {
	return getJson<RuntimeConfig>('/api/config')
}

export function createAgentSession(token: IdentityToken) {
	return postJson<AgentSessionInfo>('/api/agent/sessions', { token })
}

export function sendAgentMessage(sessionId: string, message: string) {
	return postJson<AgentRunResponse>(
		`/api/agent/sessions/${encodeURIComponent(sessionId)}/messages`,
		{ message }
	)
}

export function runAgentAppDemo(sessionId: string) {
	return postJson<AgentRunResponse>(
		`/api/agent/sessions/${encodeURIComponent(sessionId)}/app-demo`,
		{}
	)
}

export function resolveAgentConfirmation(
	confirmationId: string,
	accepted: boolean
) {
	return postJson<AgentRunResponse>(
		`/api/agent/confirmations/${encodeURIComponent(confirmationId)}`,
		{ accepted }
	)
}
