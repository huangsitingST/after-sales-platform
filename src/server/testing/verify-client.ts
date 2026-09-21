import 'dotenv/config'

import { McpClientService } from '../modules/mcp/client/mcp-client.service.js'
import type { McpClientSession } from '../modules/mcp/contracts/client.contract.js'
import type {
	McpResourceResult,
	McpToolResult
} from '../modules/mcp/contracts/shared.types.js'

const client = new McpClientService()

function title(text: string) {
	console.log(`\n================ ${text} ================`)
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`验证失败：${message}`)
	console.log(`✓ ${message}`)
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseToolResult<T = any>(result: McpToolResult): T {
	if (result.structuredContent) return result.structuredContent as T
	const text = result.content?.find((item) => item.type === 'text')?.text
	if (!text) throw new Error('Tool 没有返回可解析的结果')
	return JSON.parse(text)
}

function withClient<T>(
	token: string,
	action: (session: McpClientSession) => Promise<T>
) {
	return client.withClient({ token, autoConfirm: true }, action)
}

async function call<T = any>(
	token: string,
	name: string,
	args: Record<string, unknown>
): Promise<T> {
	return withClient(token, async (session) =>
		parseToolResult(await session.callTool({ name, arguments: args }))
	)
}

async function listTools(token: string) {
	return withClient(token, (session) => session.listTools())
}

async function readResource(token: string, uri: string) {
	return withClient(token, (session) =>
		session.readResource({ uri })
	) as Promise<McpResourceResult>
}

// title('1. 能力发现与角色权限')
// const serviceTools = (await listTools('token-blue-service')).tools
// const financeTools = (await listTools('token-blue-finance')).tools
// assert(
// 	serviceTools.some((tool) => tool.name === 'preview_refund'),
// 	'客服可以发现退款预检 Tool'
// )
// assert(
// 	!serviceTools.some(
// 		(tool) => tool.name === 'start_batch_refund_review'
// 	),
// 	'客服看不到财务批量审核 Tool'
// )
// assert(
// 	financeTools.some(
// 		(tool) => tool.name === 'start_batch_refund_review'
// 	),
// 	'财务可以发现批量审核 Tool'
// )

// title('2. 同订单号下的租户隔离')
// const blueOrder = await call(
// 	'token-blue-service',
// 	'get_order_detail',
// 	{ orderId: 'A1024' }
// )
// const starOrder = await call(
// 	'token-star-service',
// 	'get_order_detail',
// 	{ orderId: 'A1024' }
// )
// assert(
// 	blueOrder.order.productName !== starOrder.order.productName,
// 	'订单查询始终使用登录人的 tenantId'
// )

// title('3. Tool、Resource 与 Prompt')
// const preview = await call(
// 	'token-blue-service',
// 	'preview_refund',
// 	{
// 		orderId: 'A1024',
// 		reason: '商品不符合预期'
// 	}
// )
// assert(
// 	preview.preview.manualReview === true,
// 	'3000 元退款被确定性规则判定为人工审核'
// )

// const policy = await readResource(
// 	'token-blue-service',
// 	'after-sales://policies/refund-policy'
// )
// assert(
// 	policy.contents[0]?.text?.includes('蓝鲸科技'),
// 	'Resource 返回当前租户的规则'
// )

// const prompt = await withClient('token-blue-service', (session) =>
// 	session.getPrompt({
// 		name: 'handle_after_sales_case',
// 		arguments: {
// 			orderId: 'A1024',
// 			customerQuestion: '可以退款吗？'
// 		}
// 	})
// )
// assert(prompt.messages.length === 1, 'Host 可以获取售后任务 Prompt')

title('4. Human-in-the-Loop 与幂等退款')
const idempotencyKey = `course-refund-${Date.now()}`
const firstRefund = await call(
	'token-blue-service',
	'submit_refund_request',
	{
		orderId: 'A1024',
		reason: '商品不符合预期',
		idempotencyKey
	}
)
console.log('1++++firstRefund', firstRefund)
// const secondRefund = await call(
// 	'token-blue-service',
// 	'submit_refund_request',
// 	{
// 		orderId: 'A1024',
// 		reason: '商品不符合预期',
// 		idempotencyKey
// 	}
// )
// console.log('2++++secondRefund', secondRefund)

// assert(
// 	firstRefund.refundRequest.refundId ===
// 		secondRefund.refundRequest.refundId,
// 	'重复调用没有创建第二张退款单'
// )
// assert(
// 	secondRefund.duplicated === true,
// 	'第二次调用被识别为幂等重试'
// )

// title('5. 业务长任务')
// const started = await call(
// 	'token-blue-finance',
// 	'start_batch_refund_review',
// 	{ orderIds: ['A1024', 'A1025', 'A1026'] }
// )

// let snapshot: any
// do {
// 	await sleep(500)
// 	snapshot = await call(
// 		'token-blue-finance',
// 		'get_batch_review_status',
// 		{ jobId: started.job.jobId }
// 	)
// 	console.log(`[${snapshot.job.progress}%] ${snapshot.job.message}`)
// } while (snapshot.job.status === 'working')

// assert(
// 	snapshot.job.status === 'completed',
// 	'Client 通过 jobId 取回长任务结果'
// )

// title('6. 批量审核报告')
// const report = await call(
// 	'token-blue-finance',
// 	'get_batch_review_report',
// 	{ jobId: started.job.jobId }
// )
// assert(report.job.result.total === 3, '报告 Tool 返回结构化审核数据')

// console.log('\n全部验证通过。')
