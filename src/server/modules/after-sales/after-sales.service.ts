import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import type { Principal } from '../mcp/contracts/shared.types.js'
import { logistics, orders, policies } from './data.js'

interface BusinessError {
	ok: false
	error: {
		code: string
		message: string
	}
}

type BusinessResult<T> = ({ ok: true } & T) | BusinessError

interface RefundRequest {
	refundId: string
	tenantId: string
	orderId: string
	amount: number
	reason: string
	status: 'manual_review' | 'approved'
	createdBy: string
	createdAt: string
}

interface ReviewJob {
	jobId: string
	tenantId: string
	orderIds: string[]
	status: 'working'
	createdBy: string
	createdAt: number
	cancelledAt: number | null
}

interface AuditLog {
	auditId: string
	tenantId: string
	userId: string
	action: string
	targetId: string
	detail: Record<string, unknown>
	createdAt: string
}

const refundRequests = new Map<string, RefundRequest>()
const reviewJobs = new Map<string, ReviewJob>()
const auditLogs: AuditLog[] = []

function businessError(code: string, message: string): BusinessError {
	return { ok: false, error: { code, message } }
}

function appendAudit(
	principal: Principal,
	action: string,
	targetId: string,
	detail: Record<string, unknown> = {}
) {
	auditLogs.push({
		auditId: randomUUID(),
		tenantId: principal.tenantId,
		userId: principal.userId,
		action,
		targetId,
		detail,
		createdAt: new Date().toISOString()
	})
}

@Injectable()
export class AfterSalesService {
	getOrder(
		principal: Principal,
		orderId: string
	): BusinessResult<{ order: (typeof orders)[number] }> {
		const order = orders.find(
			(item) =>
				item.tenantId === principal.tenantId && item.orderId === orderId
		)

		return order
			? { ok: true, order: { ...order } }
			: businessError('ORDER_NOT_FOUND', `没有找到订单 ${orderId}`)
	}

	getLogistics(
		principal: Principal,
		orderId: string
	): BusinessResult<{ logistics: (typeof logistics)[number] }> {
		const orderResult = this.getOrder(principal, orderId)
		if (!orderResult.ok) return orderResult

		const trace = logistics.find(
			(item) =>
				item.tenantId === principal.tenantId && item.orderId === orderId
		)

		return trace
			? { ok: true, logistics: structuredClone(trace) }
			: businessError(
					'LOGISTICS_NOT_FOUND',
					`订单 ${orderId} 暂无物流信息`
			  )
	}

	getPolicy(
		principal: Principal,
		code: string
	): BusinessResult<{ policy: (typeof policies)[number] }> {
		const policy = policies.find(
			(item) =>
				item.tenantId === principal.tenantId && item.code === code
		)

		return policy
			? { ok: true, policy: { ...policy } }
			: businessError('POLICY_NOT_FOUND', `没有找到规则 ${code}`)
	}

	searchPolicies(
		principal: Principal,
		query: string
	): BusinessResult<{ results: Array<(typeof policies)[number] & { score: number }> }> {
		const words = query
			.toLowerCase()
			.split(/[\s，。？！、]+/)
			.filter(Boolean)

		const results = policies
			.filter((item) => item.tenantId === principal.tenantId)
			.map((item) => ({
				...item,
				score: words.filter((word) =>
					`${item.title}\n${item.content}`
						.toLowerCase()
						.includes(word)
				).length
			}))
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)

		return { ok: true, results }
	}

	previewRefund(
		principal: Principal,
		orderId: string,
		reason: string
	): BusinessResult<{
		preview: {
			orderId: string
			productName: string
			refundAmount: number
			reason: string
			eligible: boolean
			manualReview: boolean
			conclusion: string
		}
	}> {
		const orderResult = this.getOrder(principal, orderId)
		if (!orderResult.ok) return orderResult

		const { order } = orderResult
		let eligible = true
		let manualReview = false
		let conclusion = '订单满足自动退款条件。'

		if (order.status !== 'delivered') {
			eligible = false
			conclusion = '订单尚未签收，不能按已签收退款流程处理。'
		} else if (order.category === 'fresh') {
			eligible = false
			conclusion = '生鲜商品不支持无理由退款。'
		} else if (order.signedDays > 7) {
			eligible = false
			conclusion = `订单已签收 ${order.signedDays} 天，超过 7 天退款期限。`
		} else if (order.amount > 2000) {
			manualReview = true
			conclusion = `退款金额 ${order.amount} 元，超过 2000 元，需要人工审核。`
		}

		return {
			ok: true,
			preview: {
				orderId,
				productName: order.productName,
				refundAmount: order.amount,
				reason,
				eligible,
				manualReview,
				conclusion
			}
		}
	}

	submitRefund(
		principal: Principal,
		{
			orderId,
			reason,
			idempotencyKey
		}: {
			orderId: string
			reason: string
			idempotencyKey: string
		}
	): BusinessResult<{
		duplicated: boolean
		refundRequest: RefundRequest
	}> {
		const idempotencyId = `${principal.tenantId}:${idempotencyKey}`
		const existing = refundRequests.get(idempotencyId)
		console.log('existing', existing, refundRequests.toString())
		if (existing) {
			return {
				ok: true,
				duplicated: true,
				refundRequest: { ...existing }
			}
		}

		const previewResult = this.previewRefund(principal, orderId, reason)
		if (!previewResult.ok) return previewResult
		if (!previewResult.preview.eligible) {
			return businessError(
				'REFUND_NOT_ELIGIBLE',
				previewResult.preview.conclusion
			)
		}

		const refundRequest: RefundRequest = {
			refundId: `REF-${randomUUID().slice(0, 8).toUpperCase()}`,
			tenantId: principal.tenantId,
			orderId,
			amount: previewResult.preview.refundAmount,
			reason,
			status: previewResult.preview.manualReview
				? 'manual_review'
				: 'approved',
			createdBy: principal.userId,
			createdAt: new Date().toISOString()
		}

		refundRequests.set(idempotencyId, refundRequest)
		appendAudit(principal, 'submit_refund', refundRequest.refundId, {
			orderId,
			idempotencyKey
		})

		return {
			ok: true,
			duplicated: false,
			refundRequest: { ...refundRequest }
		}
	}

	getRefundByIdempotencyKey(
		principal: Principal,
		idempotencyKey: string
	): RefundRequest | null {
		const refundRequest = refundRequests.get(
			`${principal.tenantId}:${idempotencyKey}`
		)

		return refundRequest ? { ...refundRequest } : null
	}

	getRefundByOrderId(
		principal: Principal,
		orderId: string
	): RefundRequest | null {
		for (const refund of refundRequests.values()) {
			console.log('refund', refund)
			if (
				refund.tenantId === principal.tenantId &&
				refund.orderId === orderId
			) {
				return { ...refund }
			}
		}
		return null
	}

	startBatchReview(
		principal: Principal,
		orderIds: string[]
	): BusinessResult<{ job: Record<string, unknown> }> {
		if (principal.role !== 'finance') {
			return businessError(
				'FORBIDDEN',
				'只有财务角色可以启动批量退款审核'
			)
		}

		const invalidOrderId = orderIds.find(
			(orderId) => !this.getOrder(principal, orderId).ok
		)

		if (invalidOrderId) {
			return businessError(
				'ORDER_NOT_FOUND',
				`没有找到订单 ${invalidOrderId}`
			)
		}

		const job: ReviewJob = {
			jobId: `JOB-${randomUUID().slice(0, 8).toUpperCase()}`,
			tenantId: principal.tenantId,
			orderIds: [...orderIds],
			status: 'working',
			createdBy: principal.userId,
			createdAt: Date.now(),
			cancelledAt: null
		}

		reviewJobs.set(job.jobId, job)
		appendAudit(principal, 'start_batch_review', job.jobId, { orderIds })

		const snapshot = this.getJobSnapshot(principal, job.jobId)
		if (!snapshot.ok) return snapshot
		return { ok: true, job: snapshot.job }
	}

	getJobSnapshot(
		principal: Principal,
		jobId: string
	): BusinessResult<{ job: Record<string, unknown> }> {
		const job = reviewJobs.get(jobId)
		if (!job || job.tenantId !== principal.tenantId) {
			return businessError('JOB_NOT_FOUND', `没有找到任务 ${jobId}`)
		}

		if (job.cancelledAt) {
			return {
				ok: true,
				job: { ...job, status: 'cancelled', progress: 0, message: '任务已取消' }
			}
		}

		const elapsed = Date.now() - job.createdAt
		if (elapsed < 800) {
			return {
				ok: true,
				job: {
					...job,
					status: 'working',
					progress: 25,
					message: '正在读取订单'
				}
			}
		}

		if (elapsed < 1600) {
			return {
				ok: true,
				job: {
					...job,
					status: 'working',
					progress: 70,
					message: '正在执行退款规则'
				}
			}
		}

		const details = job.orderIds.map((orderId) => {
			const result = this.previewRefund(principal, orderId, '批量审核')
			return {
				orderId,
				eligible: result.ok ? result.preview.eligible : false,
				manualReview: result.ok ? result.preview.manualReview : false,
				conclusion: result.ok
					? result.preview.conclusion
					: result.error.message
			}
		})

		return {
			ok: true,
			job: {
				...job,
				status: 'completed',
				progress: 100,
				message: '批量审核完成',
				result: {
					total: details.length,
					autoApproved: details.filter(
						(item) => item.eligible && !item.manualReview
					).length,
					manualReview: details.filter(
						(item) => item.manualReview
					).length,
					rejected: details.filter((item) => !item.eligible).length,
					details
				}
			}
		}
	}

	cancelBatchReview(
		principal: Principal,
		jobId: string
	): BusinessResult<{ job: Record<string, unknown> }> {
		if (principal.role !== 'finance') {
			return businessError(
				'FORBIDDEN',
				'只有财务角色可以取消批量退款审核'
			)
		}

		const snapshot = this.getJobSnapshot(principal, jobId)
		if (!snapshot.ok) return snapshot
		if (snapshot.job.status === 'completed') {
			return businessError(
				'JOB_ALREADY_COMPLETED',
				'任务已经完成，无法取消'
			)
		}

		const job = reviewJobs.get(jobId)
		if (!job) {
			return businessError('JOB_NOT_FOUND', `没有找到任务 ${jobId}`)
		}
		job.cancelledAt = Date.now()
		appendAudit(principal, 'cancel_batch_review', jobId)

		return this.getJobSnapshot(principal, jobId)
	}

	getAuditLogs(principal: Principal): AuditLog[] {
		return auditLogs.filter((item) => item.tenantId === principal.tenantId)
	}
}
