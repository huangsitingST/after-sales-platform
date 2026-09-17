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
			businessResult(afterSales.getOrder(principal, orderId))
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
			businessResult(afterSales.getLogistics(principal, orderId))
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
			businessResult(afterSales.searchPolicies(principal, query))
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
				afterSales.previewRefund(principal, orderId, reason)
			)
	)

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
			const existingRefund = afterSales.getRefundByIdempotencyKey(
				principal,
				args.idempotencyKey
			)

			if (existingRefund) {
				return jsonResult({
					ok: true,
					duplicated: true,
					refundRequest: existingRefund
				})
			}

			const previousState = context.mcpReq.requestState()
			const response = inputResponse(
				context.mcpReq.inputResponses,
				'confirm-refund'
			)

			if (response.kind === 'elicit' && response.action !== 'accept') {
				return cancelledResult('用户取消了退款提交')
			}

			const confirmation = acceptedContent(
				context.mcpReq.inputResponses,
				'confirm-refund',
				confirmationResponseSchema
			)

			if (!confirmation?.confirm) {
				const preview = afterSales.previewRefund(
					principal,
					args.orderId,
					args.reason
				)

				if (!preview.ok || !preview.preview.eligible) {
					return businessResult(preview)
				}

				const requestState = await requestStateCodec.mint(
					{
						operation: 'submit_refund_request',
						...args
					},
					context
				)

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

			if (
				previousState?.operation !== 'submit_refund_request' ||
				previousState.orderId !== args.orderId ||
				previousState.idempotencyKey !== args.idempotencyKey
			) {
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

			return businessResult(
				afterSales.submitRefund(principal, args)
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
			const result = afterSales.getPolicy(principal, 'refund-policy')

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
