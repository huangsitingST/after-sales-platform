import {
	RESOURCE_MIME_TYPE,
	registerAppResource,
	registerAppTool
} from '@modelcontextprotocol/ext-apps/server'
import {
	acceptedContent,
	inputRequired,
	inputResponse
} from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import type { AfterSalesService } from '../../../after-sales/after-sales.service.js'
import type { Principal } from '../../contracts/shared.types.js'
import { requestStateCodec } from '../request-state.js'
import { AFTER_SALES_APP_URI } from '../server.constants.js'
import { businessResult, cancelledResult, jsonResult } from '../tool-results.js'

const confirmationResponseSchema = z.object({
	confirm: z.boolean()
})

export function registerFinanceCapabilities(
	server: any,
	principal: Principal,
	appHtml: string,
	afterSales: AfterSalesService
) {
	server.registerTool(
		'start_batch_refund_review',
		{
			title: '启动批量退款审核',
			description: '经确认后创建批量退款审核后台任务，并立即返回 jobId',
			inputSchema: z.object({
				orderIds: z.array(z.string()).min(1).max(20)
			}),
			annotations: { readOnlyHint: false, destructiveHint: true }
		},
		async ({ orderIds }: { orderIds: string[] }, context: any) => {
			const previousState = context.mcpReq.requestState()
			const response = inputResponse(
				context.mcpReq.inputResponses,
				'confirm-batch'
			)

			if (response.kind === 'elicit' && response.action !== 'accept') {
				return cancelledResult('用户取消了批量退款审核')
			}

			const confirmation = acceptedContent(
				context.mcpReq.inputResponses,
				'confirm-batch',
				confirmationResponseSchema
			)

			if (!confirmation?.confirm) {
				const requestState = await requestStateCodec.mint(
					{ operation: 'start_batch_refund_review', orderIds },
					context
				)

				return inputRequired({
					requestState,
					inputRequests: {
						'confirm-batch': inputRequired.elicit({
							message: `即将审核 ${orderIds.length} 笔退款订单，是否继续？`,
							requestedSchema: {
								type: 'object',
								properties: { confirm: { type: 'boolean' } },
								required: ['confirm']
							}
						})
					}
				})
			}

			if (
				previousState?.operation !== 'start_batch_refund_review' ||
				JSON.stringify(previousState.orderIds) !==
					JSON.stringify(orderIds)
			) {
				return jsonResult(
					{
						ok: false,
						error: {
							code: 'INVALID_REQUEST_STATE',
							message: '确认信息与当前批量任务不一致'
						}
					},
					true
				)
			}

			return businessResult(
				afterSales.startBatchReview(principal, orderIds)
			)
		}
	)

	server.registerTool(
		'get_batch_review_status',
		{
			title: '查询批量审核状态',
			description: '根据 jobId 查询后台审核任务的进度和结果',
			inputSchema: z.object({ jobId: z.string() }),
			annotations: { readOnlyHint: true, idempotentHint: true }
		},
		async ({ jobId }: { jobId: string }) =>
			businessResult(
				afterSales.getJobSnapshot(principal, jobId)
			) as never
	)

	server.registerTool(
		'cancel_batch_review',
		{
			title: '取消批量审核',
			description: '取消尚未执行完成的批量退款审核任务',
			inputSchema: z.object({ jobId: z.string() }),
			annotations: { readOnlyHint: false, destructiveHint: true }
		},
		async ({ jobId }: { jobId: string }) =>
			businessResult(afterSales.cancelBatchReview(principal, jobId))
	)

	server.registerResource(
		'recent-audit-logs',
		'after-sales://audit/recent',
		{
			title: '近期售后审计记录',
			description: '当前企业最近的退款和批量审核操作记录',
			mimeType: 'application/json'
		},
		async (uri: URL) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(
						afterSales.getAuditLogs(principal).slice(-20),
						null,
						2
					)
				}
			]
		})
	)

	registerAppTool(
		server,
		'get_batch_review_report',
		{
			title: '查看批量审核报告',
			description: '读取已完成的批量审核结果，并使用 MCP App 展示报告',
			inputSchema: z.object({ jobId: z.string() }),
			annotations: { readOnlyHint: true, idempotentHint: true },
			_meta: { ui: { resourceUri: AFTER_SALES_APP_URI } }
		},
		async ({ jobId }: { jobId: string }) =>
			businessResult(
				afterSales.getJobSnapshot(principal, jobId)
			) as never
	)

	registerAppResource(
		server,
		'批量退款审核报告',
		AFTER_SALES_APP_URI,
		{ description: '以可视化界面展示批量退款审核结果' },
		async () => ({
			contents: [
				{
					uri: AFTER_SALES_APP_URI,
					mimeType: RESOURCE_MIME_TYPE,
					text: appHtml,
					_meta: { ui: { prefersBorder: false } }
				}
			]
		})
	)
}
