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
	AgentAppEvent,
	AgentAppPayload,
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

function extractToolText(result: McpToolResult) {
	return (
		result.content?.find((item) => item.type === 'text')?.text ??
		JSON.stringify(result.structuredContent ?? {})
	)
}

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

function readUiMeta(meta: Record<string, unknown> | undefined) {
	const ui = meta?.ui
	return ui && typeof ui === 'object'
		? (ui as Record<string, unknown>)
		: undefined
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
	private readonly sessions = new Map<string, AgentSession>()
	private readonly confirmations = new Map<string, PendingConfirmation>()
	private readonly confirmationBySession = new Map<string, string>()

	constructor(
		@Inject(McpHostService)
		private readonly mcpHost: McpHostService,
		@Inject(DeepSeekService)
		private readonly deepSeek: DeepSeekService
	) {}

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

	private async resumeChat(
		session: AgentSession,
		operation: Extract<PendingOperation, { kind: 'chat' }>,
		decision: ElicitationDecision
	): Promise<AgentRunResponse> {
		const events: AgentEvent[] = []
		const confirmation = await this.runToolCalls(
			session,
			operation.remainingToolCalls,
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
		await this.appendAppEvent(session, name, args, result, events)
		return { kind: 'result', result }
	}

	private async appendAppEvent(
		session: AgentSession,
		toolName: string,
		args: Record<string, unknown>,
		result: McpToolResult,
		events: AgentEvent[]
	) {
		const tool = session.tools.find((item) => item.name === toolName)
		const resourceUri = tool?._meta?.ui?.resourceUri
		if (!resourceUri) return

		const resource = await this.mcpHost.readResource({
			token: session.token,
			uri: resourceUri
		})
		const content = resource.contents[0]
		if (!content) return

		const ui = readUiMeta(content._meta)
		const app: AgentAppPayload = {
			resourceUri,
			html: content.blob
				? Buffer.from(content.blob, 'base64').toString('utf8')
				: (content.text ?? ''),
			toolName,
			args,
			result,
			csp: ui?.csp as Record<string, unknown> | undefined,
			permissions: ui?.permissions as
				| Record<string, unknown>
				| undefined
		}
		const event: AgentAppEvent = {
			id: randomUUID(),
			type: 'app',
			app
		}
		events.push(event)
	}

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

	private getSession(sessionId: string) {
		const session = this.sessions.get(sessionId)
		if (!session) throw new NotFoundException('Agent 会话不存在或已过期')
		return session
	}

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
