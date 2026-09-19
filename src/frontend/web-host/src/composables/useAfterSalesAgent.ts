import { computed, reactive, shallowRef } from 'vue'

import {
	createAgentSession,
	getRuntimeConfig,
	resolveAgentConfirmation,
	runAgentAppDemo,
	sendAgentMessage
} from '../api/agent-api'
import type {
	AgentEvent,
	AgentRunResponse,
	AgentSessionInfo,
	ConnectionState,
	IdentityToken,
	RuntimeConfig
} from '../types/agent'

const identityLabels: Record<IdentityToken, string> = {
	'token-blue-service': '蓝鲸科技客服',
	'token-blue-finance': '蓝鲸科技财务',
	// 'token-star-service': '星河零售客服'
}

function createId() {
	return crypto.randomUUID()
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}

export function useAfterSalesAgent() {
	const identity = shallowRef<IdentityToken>('token-blue-service')
	const config = shallowRef<RuntimeConfig>()
	const session = shallowRef<AgentSessionInfo>()
	const timeline = shallowRef<AgentEvent[]>([])
	const busy = shallowRef(false)
	const connection = reactive<ConnectionState>({
		status: 'connecting',
		text: '正在连接 Agent 服务……'
	})
	const confirmation = reactive<{
		visible: boolean
		confirmationId: string | null
		message: string
	}>({
		visible: false,
		confirmationId: null,
		message: ''
	})

	const modelName = computed(() => session.value?.model ?? '--')
	const capabilityCount = computed(() => session.value?.toolCount ?? 0)
	const interactionDisabled = computed(
		() => busy.value || confirmation.visible
	)

	function updateConnection(
		status: ConnectionState['status'],
		text: string
	) {
		connection.status = status
		connection.text = text
	}

	function mergeEvents(events: AgentEvent[]) {
		const next = [...timeline.value]
		const indexes = new Map(
			next.map((event, index) => [event.id, index])
		)

		for (const event of events) {
			const index = indexes.get(event.id)
			if (index === undefined) {
				indexes.set(event.id, next.length)
				next.push(event)
				continue
			}
			next[index] = event
		}

		timeline.value = next
	}

	function appendMessage(role: 'user' | 'assistant', text: string) {
		timeline.value = [
			...timeline.value,
			{
				id: createId(),
				type: 'message',
				role,
				text
			}
		]
	}

	function appendStatus(text: string) {
		const id = createId()
		timeline.value = [
			...timeline.value,
			{
				id,
				type: 'status',
				text
			}
		]
		return id
	}

	function removeTimelineItem(id: string) {
		timeline.value = timeline.value.filter((event) => event.id !== id)
	}

	function applyRunResponse(response: AgentRunResponse) {
		mergeEvents(response.events)

		if (response.kind === 'confirmation_required') {
			confirmation.confirmationId = response.confirmationId
			confirmation.message = response.message
			confirmation.visible = true
			return
		}

		confirmation.visible = false
		confirmation.confirmationId = null
		confirmation.message = ''
	}

	async function openSession() {
		updateConnection('connecting', '正在连接 Agent 服务……')

		try {
			session.value = await createAgentSession(identity.value)
			updateConnection(
				'connected',
				`${identityLabels[identity.value]} 已连接`
			)
		} catch (error) {
			session.value = undefined
			updateConnection('error', errorMessage(error))
			throw error
		}
	}

	async function startNewConversation() {
		if (busy.value) return

		busy.value = true
		try {
			await openSession()
			timeline.value = []
			appendMessage(
				'assistant',
				`已切换为${identityLabels[identity.value]}。这是一段新对话，你可以开始提问。`
			)
		} catch (error) {
			appendMessage('assistant', `连接失败：${errorMessage(error)}`)
		} finally {
			busy.value = false
		}
	}

	async function submitQuestion(question: string) {
		const normalized = question.trim()
		if (!normalized || interactionDisabled.value || !session.value) return

		appendMessage('user', normalized)
		const statusId = appendStatus('Agent 正在处理并选择能力……')
		busy.value = true

		try {
			const response = await sendAgentMessage(
				session.value.sessionId,
				normalized
			)
			applyRunResponse(response)
		} catch (error) {
			appendMessage('assistant', `执行失败：${errorMessage(error)}`)
		} finally {
			removeTimelineItem(statusId)
			busy.value = false
		}
	}

	async function answerConfirmation(accepted: boolean) {
		const confirmationId = confirmation.confirmationId
		if (!confirmationId || busy.value) return

		confirmation.visible = false
		busy.value = true

		try {
			const response = await resolveAgentConfirmation(
				confirmationId,
				accepted
			)
			applyRunResponse(response)
		} catch (error) {
			appendMessage(
				'assistant',
				`确认操作失败：${errorMessage(error)}`
			)
		} finally {
			if (!confirmation.visible) {
				confirmation.confirmationId = null
				confirmation.message = ''
			}
			busy.value = false
		}
	}

	async function runAppDemo() {
		if (interactionDisabled.value) return

		busy.value = true
		try {
			if (identity.value !== 'token-blue-finance') {
				identity.value = 'token-blue-finance'
				await openSession()
				timeline.value = []
			}

			appendMessage(
				'user',
				'批量审核订单 A1024、A1025、A1026，并生成可视化报告。'
			)

			if (!session.value) {
				throw new Error('Agent 会话尚未建立')
			}

			const response = await runAgentAppDemo(session.value.sessionId)
			applyRunResponse(response)
		} catch (error) {
			appendMessage(
				'assistant',
				`报告演示失败：${errorMessage(error)}`
			)
		} finally {
			busy.value = false
		}
	}

	async function selectIdentity(nextIdentity: IdentityToken) {
		if (nextIdentity === identity.value) return
		identity.value = nextIdentity
		await startNewConversation()
	}

	async function initialize() {
		busy.value = true
		try {
			config.value = await getRuntimeConfig()
			await openSession()
			timeline.value = []
			appendMessage(
				'assistant',
				`已切换为${identityLabels[identity.value]}。这是一段新对话，你可以开始提问。`
			)
		} catch (error) {
			appendMessage('assistant', `初始化失败：${errorMessage(error)}`)
		} finally {
			busy.value = false
		}
	}

	return {
		identity,
		config,
		timeline,
		connection,
		confirmation,
		modelName,
		capabilityCount,
		interactionDisabled,
		initialize,
		selectIdentity,
		startNewConversation,
		submitQuestion,
		runAppDemo,
		answerConfirmation
	}
}
