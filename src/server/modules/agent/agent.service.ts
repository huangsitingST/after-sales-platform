import { randomUUID } from 'node:crypto'

import {
	BadRequestException,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common'

import type {
	ElicitationDecision,
	McpToolDescriptor,
	McpToolResult,
	ModelMessage,
	ModelTool,
	ModelToolCall
} from '../mcp/contracts/shared.types.js'
import { McpHostService } from '../mcp/host/mcp-host.service.js'
import { DeepSeekService } from '../model/deepseek.service.js'
import type {
	AgentConfirmationInput,
	AgentEvent,
	AgentMessageInput,
	AgentRunResponse,
	AgentSessionInfo,
	AgentToolEvent
} from './agent.contract.js'

const MAX_TOOL_ROUNDS = 8
const SESSION_TTL_MS = 60 * 60 * 1000
const CONFIRMATION_TTL_MS = 5 * 60 * 1000

interface AgentSession {
	id: string
	token: string
	messages: ModelMessage[]
	tools: McpToolDescriptor[]
	updatedAt: number
}

interface PendingConfirmation {
	id: string
	sessionId: string
	expiresAt: number
	operation: PendingOperation
}

interface PendingOperation {
	kind: 'chat'
	nextRound: number
	remainingToolCalls: ModelToolCall[]
	toolEventId: string
}

/** 创建 Agent 会话的初始系统消息，约束模型的身份、工具使用和回答方式。 */
function createSystemMessages(): ModelMessage[] {
	return [
		{
			role: 'system',
			content: [
				'你是企业售后 Agent。',
				'订单、物流和规则必须通过工具查询，不能编造。',
				'先调用只读工具核对事实，只有用户明确要求提交时才调用写操作。',
				'执行写操作前遵守服务端返回的人工确认要求。',
				'回答使用简洁的中文，不要使用 Markdown 表格。',
				'当财务用户要求查看已完成的批量审核报告时，调用 get_batch_review_report。'
			].join('\n')
		}
	]
}

/** 将 MCP 工具结果转换为可写回模型上下文的文本。 */
function extractToolText(result: McpToolResult) {
	return (
		result.content?.find((item) => item.type === 'text')?.text ??
		JSON.stringify(result.structuredContent ?? {})
	)
}

/** 解析并校验模型生成的工具调用参数。 */
function parseToolArguments(value: string) {
	try {
		const parsed = JSON.parse(value || '{}') as unknown
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('参数必须是对象')
		}
		return parsed as Record<string, unknown>
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		throw new BadRequestException(`Tool 参数解析失败：${message}`)
	}
}

type InvokeToolResult =
	| {
			kind: 'result'
			result: McpToolResult
	  }
	| {
			kind: 'elicitation'
			message: string
	  }

@Injectable()
export class AgentService {
	// 会话存储
	private readonly sessions = new Map<string, AgentSession>()
	// 确认请求存储
	private readonly confirmations = new Map<string, PendingConfirmation>()
	// 会话确认请求映射
	private readonly confirmationBySession = new Map<string, string>()

	constructor(
		@Inject(McpHostService)
		private readonly mcpHost: McpHostService,
		@Inject(DeepSeekService)
		private readonly deepSeek: DeepSeekService
	) {}

	/** 创建 Agent 会话：校验 token，加载可用 MCP 工具并初始化消息历史。 */
	async createSession(token: string): Promise<AgentSessionInfo> {
		this.pruneExpired()

		if (!token.trim()) {
			throw new BadRequestException('token 不能为空')
		}

		const { tools } = await this.mcpHost.listTools({ token })
		const session: AgentSession = {
			id: randomUUID(),
			token,
			messages: createSystemMessages(),
			tools,
			updatedAt: Date.now()
		}

		this.sessions.set(session.id, session)

		return {
			sessionId: session.id,
			model: this.deepSeek.modelName,
			toolCount: tools.length
		}
	}

	/** 接收用户消息，并启动一次完整的模型与工具交互流程。 */
	async sendMessage(
		sessionId: string,
		input: AgentMessageInput
	): Promise<AgentRunResponse> {
		this.pruneExpired()
		const session = this.getSession(sessionId)

		if (this.confirmationBySession.has(sessionId)) {
			throw new BadRequestException('当前会话还有待确认操作')
		}

		const message = input.message?.trim()
		if (!message) {
			throw new BadRequestException('message 不能为空')
		}

		session.messages.push({ role: 'user', content: message })
		session.updatedAt = Date.now()

		return this.runModelLoop(session, 1, [])
	}

	/** 处理人工确认结果，并从中断的写操作开始恢复执行。 */
	async resolveConfirmation(
		confirmationId: string,
		input: AgentConfirmationInput
	): Promise<AgentRunResponse> {
		this.pruneExpired()
		const pending = this.confirmations.get(confirmationId)

		if (!pending) {
			throw new NotFoundException('确认请求不存在或已过期')
		}

		this.confirmations.delete(confirmationId)
		this.confirmationBySession.delete(pending.sessionId)

		const session = this.getSession(pending.sessionId)
		const decision: ElicitationDecision = input.accepted
			? 'accept'
			: 'decline'

		return this.resumeChat(session, pending.operation, decision)
	}

	/** 驱动模型与工具交替执行，直到模型不再请求工具或达到最大轮次。 */
	private async runModelLoop(
		session: AgentSession,
		startRound: number,
		events: AgentEvent[]
	): Promise<AgentRunResponse> {
		for (
			let round = startRound;
			round <= MAX_TOOL_ROUNDS;
			round += 1
		) {
			const message = await this.deepSeek.call({
				messages: session.messages,
				tools: this.toModelTools(session.tools)
			})

			session.messages.push(message)
			session.updatedAt = Date.now()

			if (message.content?.trim()) {
				events.push({
					id: randomUUID(),
					type: 'message',
					role: 'assistant',
					text: message.content
				})
			}

			if (!message.tool_calls?.length) {
				return { kind: 'completed', events }
			}

			const confirmation = await this.runToolCalls(
				session,
				message.tool_calls,
				round + 1,
				events
			)

			if (confirmation) return confirmation
		}

		throw new BadRequestException('Agent 超过了单轮最大 Tool Calling 次数')
	}

	/** 恢复暂停的聊天流程，先重试待确认的工具调用，再继续模型循环。 */
	private async resumeChat(
		session: AgentSession,
		operation: Extract<PendingOperation, { kind: 'chat' }>,
		decision: ElicitationDecision
	): Promise<AgentRunResponse> {
		const events: AgentEvent[] = []
		const confirmation = await this.runToolCalls(
			session,
			operation.remainingToolCalls, // 从确认请求中恢复的 Tool Calling 剩下的 Tool Calling
			operation.nextRound,
			events,
			{
				decision,
				eventId: operation.toolEventId
			}
		)

		if (confirmation) return confirmation

		return this.runModelLoop(session, operation.nextRound, events)
	}

	/**
	 * 顺序执行一组工具调用，将结果写回消息上下文。
	 * 遇到需要人工确认的工具时，保存剩余调用并暂停执行。
	 */
	private async runToolCalls(
		session: AgentSession,
		toolCalls: ModelToolCall[],
		nextRound: number,
		events: AgentEvent[],
		first?: {
			decision: ElicitationDecision
			eventId: string
		}
	): Promise<AgentRunResponse | undefined> {
		for (let index = 0; index < toolCalls.length; index += 1) {
			const toolCall = toolCalls[index]
			if (!toolCall) continue

			const args = parseToolArguments(toolCall.function.arguments)
			const eventId =
				index === 0 && first ? first.eventId : randomUUID()
			const decision =
				index === 0 && first ? first.decision : 'prompt'
			const invocation = await this.invokeTool({
				session,
				name: toolCall.function.name,
				args,
				decision,
				eventId,
				events
			})

			if (invocation.kind === 'elicitation') {
				return this.requireConfirmation(
					session,
					events,
					{
						kind: 'chat',
						nextRound,
						remainingToolCalls: toolCalls.slice(index),
						toolEventId: eventId
					},
					invocation.message
				)
			}

			const result = invocation.result
			session.messages.push({
				role: 'tool',
				tool_call_id: toolCall.id,
				content: extractToolText(result)
			})
			session.updatedAt = Date.now()
		}

		return undefined
	}

	/** 调用单个 MCP 工具并记录执行事件。 */
	private async invokeTool({
		session,
		name,
		args,
		decision,
		eventId,
		events,
		visible = true
	}: {
		session: AgentSession
		name: string
		args: Record<string, unknown>
		decision: ElicitationDecision
		eventId: string
		events: AgentEvent[]
		visible?: boolean
	}): Promise<InvokeToolResult> {
		const runningEvent: AgentToolEvent = {
			id: eventId,
			type: 'tool',
			name,
			args,
			status: 'running'
		}

		if (visible) events.push(runningEvent)

		const response = await this.mcpHost.callTool({
			token: session.token,
			name,
			arguments: args,
			decision
		})

		if (response.kind === 'elicitation') {
			return {
				kind: 'elicitation',
				message: response.message
			}
		}

		const result = response.result
		const completedEvent: AgentToolEvent = {
			...runningEvent,
			status: result.isError ? 'error' : 'complete',
			result
		}

		if (visible) events.push(completedEvent)
		return { kind: 'result', result }
	}

	/** 保存待确认操作并返回 confirmation_required，暂停当前 Agent 流程。 */
	private requireConfirmation(
		session: AgentSession,
		events: AgentEvent[],
		operation: PendingOperation,
		message = '即将执行写操作，是否继续？'
	): AgentRunResponse {
		const confirmationId = randomUUID()
		const expiresAt = Date.now() + CONFIRMATION_TTL_MS

		this.confirmations.set(confirmationId, {
			id: confirmationId,
			sessionId: session.id,
			expiresAt,
			operation
		})
		this.confirmationBySession.set(session.id, confirmationId)

		return {
			kind: 'confirmation_required',
			confirmationId,
			message,
			events
		}
	}

	/** 按 ID 获取会话；会话不存在或已过期时抛出异常。 */
	private getSession(sessionId: string) {
		const session = this.sessions.get(sessionId)
		if (!session) throw new NotFoundException('Agent 会话不存在或已过期')
		return session
	}

	/** 将 MCP 工具描述转换为模型可识别的 function tool 定义。 */
	private toModelTools(tools: McpToolDescriptor[]): ModelTool[] {
		return tools.map((tool) => ({
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.inputSchema
			}
		}))
	}

	/** 清理过期会话和待确认记录，防止内存中的状态无限增长。 */
	private pruneExpired() {
		const now = Date.now()

		for (const [id, session] of this.sessions) {
			if (now - session.updatedAt > SESSION_TTL_MS) {
				this.sessions.delete(id)
				this.confirmationBySession.delete(id)
			}
		}

		for (const [id, confirmation] of this.confirmations) {
			if (confirmation.expiresAt <= now) {
				this.confirmations.delete(id)
				this.confirmationBySession.delete(confirmation.sessionId)
			}
		}
	}
}
