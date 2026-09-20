import {
	acceptedContent,
	inputRequired,
	inputResponse
} from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import type { AfterSalesService } from '../../../after-sales/after-sales.service.js'
import type { Principal } from '../../contracts/shared.types.js'
import { requestStateCodec } from '../request-state.js'
import { businessResult, cancelledResult, jsonResult } from '../tool-results.js'

const confirmationResponseSchema = z.object({
	confirm: z.boolean()
})

export function registerCommonCapabilities(
	server: any,
	principal: Principal,
	afterSales: AfterSalesService
) {
	server.registerTool(
		'get_order_detail',
		{
			title: '查询订单详情',
			description: '根据订单号查询当前企业的订单详情',
			inputSchema: z.object({
				orderId: z.string().describe('订单号，例如 A1024')
			}),
			annotations: {
				readOnlyHint: true,
				idempotentHint: true
			}
		},
		async ({ orderId }: { orderId: string }) =>
			businessResult(await afterSales.getOrder(principal, orderId))
	)

	server.registerTool(
		'get_logistics_trace',
		{
			title: '查询物流轨迹',
			description: '根据订单号查询当前企业的物流轨迹',
			inputSchema: z.object({
				orderId: z.string()
			}),
			annotations: {
				readOnlyHint: true,
				idempotentHint: true
			}
		},
		async ({ orderId }: { orderId: string }) =>
			businessResult(
				await afterSales.getLogistics(principal, orderId)
			)
	)

	server.registerTool(
		'search_after_sales_policy',
		{
			title: '检索售后规则',
			description: '根据用户问题检索当前企业的售后规则',
			inputSchema: z.object({
				query: z.string().min(1)
			}),
			annotations: {
				readOnlyHint: true,
				idempotentHint: true
			}
		},
		async ({ query }: { query: string }) =>
			businessResult(
				await afterSales.searchPolicies(principal, query)
			)
	)

	server.registerTool(
		'preview_refund',
		{
			title: '退款预检',
			description: '只做退款资格和人工审核判断，不会创建退款申请',
			inputSchema: z.object({
				orderId: z.string(),
				reason: z.string().min(2)
			}),
			annotations: {
				readOnlyHint: true,
				idempotentHint: true
			}
		},
		async ({ orderId, reason }: { orderId: string; reason: string }) =>
			businessResult(
				await afterSales.previewRefund(principal, orderId, reason)
			)
	)

	// 提交退款申请：写操作（readOnlyHint: false，destructiveHint: true），
	// 通过调用方传入的 idempotencyKey 保证同一请求不会重复创建退款单。
	//
	// 采用「两段式确认」交互（Human-in-the-loop）：
	// 1. 首次调用：幂等检查 → 退款预检 → 预检通过后通过 inputRequired 向用户弹出确认卡片，
	//    此时服务端不会落库任何退款数据；
	// 2. 用户确认后携带 requestState 再次调用：校验确认凭证与本次参数一致 → 真正创建退款单。
	server.registerTool(
		'submit_refund_request',
		{
			title: '提交退款申请',
			description: '经用户确认后创建退款申请，相同幂等键不会重复创建',
			inputSchema: z.object({
				orderId: z.string(),
				reason: z.string().min(2),
				idempotencyKey: z
					.string()
					.min(8)
					.describe('调用方生成的唯一幂等键')
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true
			}
		},
		async (
			args: {
				orderId: string
				reason: string
				idempotencyKey: string
			},
			context: any
		) => {
			// 第一步：幂等检查。相同幂等键已存在退款单时直接返回原单据，
			// 避免网络重试等场景下重复创建。
			const existingRefund =
				await afterSales.getRefundByIdempotencyKey(
					principal,
					args.idempotencyKey
				)
			console.log('1----existingRefund', existingRefund)

			if (existingRefund) {
				// duplicated: true 告知调用方本次请求命中了幂等去重，
				// refundRequest 为首轮调用时已创建的退款申请。
				return jsonResult({
					ok: true,
					duplicated: true,
					refundRequest: existingRefund
				})
			}

			// 订单级去重：相同订单已存在退款单时拒绝再次创建，
			// 防止用不同幂等键绕过 idempotencyKey 级幂等。
			const refundForOrder = await afterSales.getRefundByOrderId(
				principal,
				args.orderId
			)

			if (refundForOrder) {
				return jsonResult(
					{
						ok: false,
						error: {
							code: 'ORDER_ALREADY_REFUNDED',
							message: `订单 ${args.orderId} 已存在退款单 ${refundForOrder.refundId}`
						}
					},
					true
				)
			}

			// 读取上一轮挂起的请求状态（确认回调时由客户端回传），
			// 以及用户针对 'confirm-refund' 确认卡片提交的响应。
			const previousState = context.mcpReq.requestState()
			console.log('2----previousState', previousState)
			const response = inputResponse(
				context.mcpReq.inputResponses,
				'confirm-refund'
			)
			console.log('3----response', response)

			// 用户在确认卡片上选择拒绝/取消（非 accept），终止本次提交流程。
			if (response.kind === 'elicit' && response.action !== 'accept') {
				return cancelledResult('用户取消了退款提交')
			}

			// 按 confirmationResponseSchema（{ confirm: boolean }）解析用户确认内容。
			// 首次调用时尚无用户响应，confirmation 为 undefined。
			const confirmation = acceptedContent(
				context.mcpReq.inputResponses,
				'confirm-refund',
				confirmationResponseSchema
			)
			console.log('4----confirmation', confirmation)

			if (!confirmation?.confirm) {
				// 第二段尚未完成（首次调用）：先执行退款预检，
				// 仅做退款资格与人工审核判断，不会创建退款申请。
				const preview = await afterSales.previewRefund(
					principal,
					args.orderId,
					args.reason
				)
				console.log('5----preview', preview)

				// 预检不通过（业务异常或订单不符合退款资格），直接返回预检结果，
				// 不再向用户弹出确认卡片。
				if (!preview.ok || !preview.preview.eligible) {
					return businessResult(preview)
				}

				// 预检通过：把操作类型与本次参数铸造成签名加密的 requestState
				// （含 5 分钟 TTL，并绑定调用方法与客户端身份），
				// 作为确认回调时校验「确认的是同一笔请求」的凭证。
				const requestState = await requestStateCodec.mint(
					{
						operation: 'submit_refund_request',
						...args
					},
					context
				)
				console.log('6----requestState', requestState)

				// 返回 inputRequired 暂停工具执行，要求客户端弹出确认卡片（elicit），
				// 向用户展示退款金额并收集 { confirm: boolean }。
				return inputRequired({
					requestState,
					inputRequests: {
						'confirm-refund': inputRequired.elicit({
							message: `即将为订单 ${args.orderId} 创建 ${preview.preview.refundAmount} 元退款申请，是否继续？`,
							requestedSchema: {
								type: 'object',
								properties: {
									confirm: {
										type: 'boolean'
									}
								},
								required: ['confirm']
							}
						})
					}
				})
			}

			// 第二段：用户已确认。校验回传的 requestState 与当前参数完全一致，
			// 防止把某笔请求的确认凭证挪用到其他订单或其他幂等键的请求上。
			if (
				previousState?.operation !== 'submit_refund_request' ||
				previousState.orderId !== args.orderId ||
				previousState.idempotencyKey !== args.idempotencyKey
			) {
				// jsonResult 第二个参数为 true，表示该结果是工具错误（isError）。
				return jsonResult(
					{
						ok: false,
						error: {
							code: 'INVALID_REQUEST_STATE',
							message: '确认信息与当前退款请求不一致'
						}
					},
					true
				)
			}

			// 幂等、用户确认、状态一致性校验全部通过，正式创建退款申请。
			console.log('7----args', args)
			return businessResult(
				await afterSales.submitRefund(principal, args)
			)
		}
	)

	server.registerResource(
		'refund-policy',
		'after-sales://policies/refund-policy',
		{
			title: '当前企业退款规则',
			description: '根据登录身份返回当前企业自己的退款规则',
			mimeType: 'text/markdown'
		},
		async (uri: URL) => {
			const result = await afterSales.getPolicy(
				principal,
				'refund-policy'
			)

			return {
				contents: [
					{
						uri: uri.href,
						mimeType: 'text/markdown',
						text: result.ok
							? `# ${result.policy.title}\n\n${result.policy.content}`
							: result.error.message
					}
				]
			}
		}
	)

	server.registerPrompt(
		'handle_after_sales_case',
		{
			title: '售后问题处理模板',
			description: '要求 Agent 先查询事实，再决定是否执行退款操作',
			argsSchema: z.object({
				orderId: z.string(),
				customerQuestion: z.string()
			})
		},
		({
			orderId,
			customerQuestion
		}: {
			orderId: string
			customerQuestion: string
		}) => ({
			description: '企业售后 Agent 处理模板',
			messages: [
				{
					role: 'user',
					content: {
						type: 'text',
						text: [
							'你是企业售后 Agent。',
							'先调用只读工具核对订单和规则，不允许根据用户描述猜测业务事实。',
							'只有用户明确要求提交退款时，才可以调用 submit_refund_request。',
							`订单号：${orderId}`,
							`用户问题：${customerQuestion}`
						].join('\n')
					}
				}
			]
		})
	)
}
