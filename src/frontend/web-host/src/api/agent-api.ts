/**
 * Agent 前端接口的统一封装。
 * 组件和 composable 只负责界面状态，这里负责请求地址、参数和响应类型。
 */

import type {
	AgentRunResponse,
	AgentSessionInfo,
	IdentityToken,
	RuntimeConfig
} from '../types/agent'
import { getJson, postJson } from './http'

/** 获取浏览器运行配置，例如 MCP App Sandbox 的访问地址。 */
export function getRuntimeConfig() {
	return getJson<RuntimeConfig>('/api/config')
}

/**
 * 使用演示身份 Token 创建一个独立的 Agent 会话。
 * 返回的 sessionId 会用于后续消息、确认和演示请求。
 */
export function createAgentSession(token: IdentityToken) {
	return postJson<AgentSessionInfo>('/api/agent/sessions', { token })
}

/**
 * 向指定会话发送一条用户消息。
 * encodeURIComponent 用于避免 sessionId 中的特殊字符破坏请求地址。
 */
export function sendAgentMessage(sessionId: string, message: string) {
	return postJson<AgentRunResponse>(
		`/api/agent/sessions/${encodeURIComponent(sessionId)}/messages`,
		{ message }
	)
}

/**
 * 提交用户对高风险操作的确认结果。
 * accepted 为 true 表示执行，为 false 表示取消。
 */
export function resolveAgentConfirmation(
	confirmationId: string,
	accepted: boolean
) {
	return postJson<AgentRunResponse>(
		`/api/agent/confirmations/${encodeURIComponent(confirmationId)}`,
		{ accepted }
	)
}
