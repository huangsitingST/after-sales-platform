import { randomUUID } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { MongoServerError } from 'mongodb'

import { DatabaseService } from '../database/database.service.js'
import type { Principal } from '../mcp/contracts/shared.types.js'

interface BusinessError {
	ok: false
	error: {
		code: string
		message: string
	}
}

type BusinessResult<T> = ({ ok: true } & T) | BusinessError

interface OrderDocument {
	_id: string
	tenantId: string
	orderId: string
	productName: string
	category: 'normal' | 'fresh'
	amount: number
	status: 'paid' | 'shipped' | 'delivered' | 'closed'
	signedDays: number
	customerName: string
}

interface LogisticsDocument {
	_id: string
	tenantId: string
	orderId: string
	company: string
	trackingNo: string
	events: Array<{
		time: string
		message: string
	}>
}

interface PolicyDocument {
	_id: string
	tenantId: string
	code: string
	title: string
	content: string
}

interface RefundRequestDocument {
	_id: string
	idempotencyId: string
	tenantId: string
	orderId: string
	amount: number
	reason: string
	status: 'manual_review' | 'approved'
	createdBy: string
	createdAt: Date
}

interface ReviewJobDocument {
	_id: string
	tenantId: string
	orderIds: string[]
	status: 'working' | 'completed' | 'cancelled'
	createdBy: string
	createdAt: Date
	cancelledAt: Date | null
}

interface AuditLogDocument {
	_id: string
	tenantId: string
	userId: string
	action: string
	targetId: string
	detail: Record<string, unknown>
	createdAt: Date
}

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

interface AuditLog {
	auditId: string
	tenantId: string
	userId: string
	action: string
	targetId: string
	detail: Record<string, unknown>
	createdAt: string
}

type Order = Omit<OrderDocument, '_id'>
type Logistics = Omit<LogisticsDocument, '_id'>
type Policy = Omit<PolicyDocument, '_id'>

function businessError(code: string, message: string): BusinessError {
	return { ok: false, error: { code, message } }
}

function toOrder(document: OrderDocument): Order {
	const { _id: _ignored, ...order } = document
	return order
}

function toLogistics(document: LogisticsDocument): Logistics {
	const { _id: _ignored, ...logistics } = document
	return logistics
}

function toPolicy(document: PolicyDocument): Policy {
	const { _id: _ignored, ...policy } = document
	return policy
}

function toRefundRequest(document: RefundRequestDocument): RefundRequest {
	return {
		refundId: document._id,
		tenantId: document.tenantId,
		orderId: document.orderId,
		amount: document.amount,
		reason: document.reason,
		status: document.status,
		createdBy: document.createdBy,
		createdAt: document.createdAt.toISOString()
	}
}

function toAuditLog(document: AuditLogDocument): AuditLog {
	return {
		auditId: document._id,
		tenantId: document.tenantId,
		userId: document.userId,
		action: document.action,
		targetId: document.targetId,
		detail: document.detail,
		createdAt: document.createdAt.toISOString()
	}
}

@Injectable()
export class AfterSalesService {
	constructor(
		@Inject(DatabaseService)
		private readonly database: DatabaseService
	) {}

	async getOrder(
		principal: Principal,
		orderId: string
	): Promise<BusinessResult<{ order: Order }>> {
		const document = await this.database.db
			.collection<OrderDocument>('orders')
			.findOne({
				tenantId: principal.tenantId,
				orderId
			})

		return document
			? { ok: true, order: toOrder(document) }
			: businessError('ORDER_NOT_FOUND', `没有找到订单 ${orderId}`)
	}

	async getLogistics(
		principal: Principal,
		orderId: string
	): Promise<BusinessResult<{ logistics: Logistics }>> {
		const orderResult = await this.getOrder(principal, orderId)
		if (!orderResult.ok) return orderResult

		const document = await this.database.db
			.collection<LogisticsDocument>('logistics')
			.findOne({
				tenantId: principal.tenantId,
				orderId
			})

		return document
			? { ok: true, logistics: toLogistics(document) }
			: businessError(
					'LOGISTICS_NOT_FOUND',
					`订单 ${orderId} 暂无物流信息`
			  )
	}

	async getPolicy(
		principal: Principal,
		code: string
	): Promise<BusinessResult<{ policy: Policy }>> {
		const document = await this.database.db
			.collection<PolicyDocument>('policies')
			.findOne({
				tenantId: principal.tenantId,
				code
			})

		return document
			? { ok: true, policy: toPolicy(document) }
			: businessError('POLICY_NOT_FOUND', `没有找到规则 ${code}`)
	}

	async searchPolicies(
		principal: Principal,
		query: string
	): Promise<
		BusinessResult<{
			results: Array<Policy & { score: number }>
		}>
	> {
		const words = query
			.toLowerCase()
			.split(/[\s，。？！、]+/)
			.filter(Boolean)
		const documents = await this.database.db
			.collection<PolicyDocument>('policies')
			.find({ tenantId: principal.tenantId })
			.toArray()

		const results = documents
			.map(toPolicy)
			.map((policy) => ({
				...policy,
				score: words.filter((word) =>
					`${policy.title}\n${policy.content}`
						.toLowerCase()
						.includes(word)
				).length
			}))
			.filter((policy) => policy.score > 0)
			.sort((a, b) => b.score - a.score)

		return { ok: true, results }
	}

	async previewRefund(
		principal: Principal,
		orderId: string,
		reason: string
	): Promise<
		BusinessResult<{
			preview: {
				orderId: string
				productName: string
				refundAmount: number
				reason: string
				eligible: boolean
				manualReview: boolean
				conclusion: string
			}
		}>
	> {
		const orderResult = await this.getOrder(principal, orderId)
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

	async submitRefund(
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
	): Promise<
		BusinessResult<{
			duplicated: boolean
			refundRequest: RefundRequest
		}>
	> {
		const idempotencyId = `${principal.tenantId}:${idempotencyKey}`
		const existing = await this.getRefundByIdempotencyKey(
			principal,
			idempotencyKey
		)
		if (existing) {
			return {
				ok: true,
				duplicated: true,
				refundRequest: existing
			}
		}

		const previewResult = await this.previewRefund(
			principal,
			orderId,
			reason
		)
		if (!previewResult.ok) return previewResult
		if (!previewResult.preview.eligible) {
			return businessError(
				'REFUND_NOT_ELIGIBLE',
				previewResult.preview.conclusion
			)
		}

		const refundRequest: RefundRequestDocument = {
			_id: `REF-${randomUUID().slice(0, 8).toUpperCase()}`,
			idempotencyId,
			tenantId: principal.tenantId,
			orderId,
			amount: previewResult.preview.refundAmount,
			reason,
			status: previewResult.preview.manualReview
				? 'manual_review'
				: 'approved',
			createdBy: principal.userId,
			createdAt: new Date()
		}

		try {
			await this.database.db
				.collection<RefundRequestDocument>('refund_requests')
				.insertOne(refundRequest)
		} catch (error) {
			if (error instanceof MongoServerError && error.code === 11000) {
				const duplicated = await this.getRefundByIdempotencyKey(
					principal,
					idempotencyKey
				)
				if (duplicated) {
					return {
						ok: true,
						duplicated: true,
						refundRequest: duplicated
					}
				}

				const refundForOrder = await this.getRefundByOrderId(
					principal,
					orderId
				)
				if (refundForOrder) {
					return businessError(
						'ORDER_ALREADY_REFUNDED',
						`订单 ${orderId} 已存在退款单 ${refundForOrder.refundId}`
					)
				}
			}

			throw error
		}

		await this.appendAudit(
			principal,
			'submit_refund',
			refundRequest._id,
			{
				orderId,
				idempotencyKey
			}
		)

		return {
			ok: true,
			duplicated: false,
			refundRequest: toRefundRequest(refundRequest)
		}
	}

	async getRefundByIdempotencyKey(
		principal: Principal,
		idempotencyKey: string
	): Promise<RefundRequest | null> {
		const document = await this.database.db
			.collection<RefundRequestDocument>('refund_requests')
			.findOne({
				idempotencyId: `${principal.tenantId}:${idempotencyKey}`
			})

		return document ? toRefundRequest(document) : null
	}

	async getRefundByOrderId(
		principal: Principal,
		orderId: string
	): Promise<RefundRequest | null> {
		const document = await this.database.db
			.collection<RefundRequestDocument>('refund_requests')
			.findOne({
				tenantId: principal.tenantId,
				orderId
			})

		return document ? toRefundRequest(document) : null
	}

	async startBatchReview(
		principal: Principal,
		orderIds: string[]
	): Promise<BusinessResult<{ job: Record<string, unknown> }>> {
		if (principal.role !== 'finance') {
			return businessError(
				'FORBIDDEN',
				'只有财务角色可以启动批量退款审核'
			)
		}

		for (const orderId of orderIds) {
			const orderResult = await this.getOrder(principal, orderId)
			if (!orderResult.ok) {
				return businessError(
					'ORDER_NOT_FOUND',
					`没有找到订单 ${orderId}`
				)
			}
		}

		const job: ReviewJobDocument = {
			_id: `JOB-${randomUUID().slice(0, 8).toUpperCase()}`,
			tenantId: principal.tenantId,
			orderIds: [...orderIds],
			status: 'working',
			createdBy: principal.userId,
			createdAt: new Date(),
			cancelledAt: null
		}

		await this.database.db
			.collection<ReviewJobDocument>('review_jobs')
			.insertOne(job)
		await this.appendAudit(
			principal,
			'start_batch_review',
			job._id,
			{ orderIds }
		)

		return this.getJobSnapshot(principal, job._id)
	}

	async getJobSnapshot(
		principal: Principal,
		jobId: string
	): Promise<BusinessResult<{ job: Record<string, unknown> }>> {
		const job = await this.database.db
			.collection<ReviewJobDocument>('review_jobs')
			.findOne({
				_id: jobId,
				tenantId: principal.tenantId
			})

		if (!job) {
			return businessError('JOB_NOT_FOUND', `没有找到任务 ${jobId}`)
		}

		const jobView = {
			jobId: job._id,
			tenantId: job.tenantId,
			orderIds: job.orderIds,
			status: job.status,
			createdBy: job.createdBy,
			createdAt: job.createdAt.getTime(),
			cancelledAt: job.cancelledAt?.getTime() ?? null
		}

		if (job.cancelledAt) {
			return {
				ok: true,
				job: {
					...jobView,
					status: 'cancelled',
					progress: 0,
					message: '任务已取消'
				}
			}
		}

		const elapsed = Date.now() - job.createdAt.getTime()
		if (elapsed < 800) {
			return {
				ok: true,
				job: {
					...jobView,
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
					...jobView,
					status: 'working',
					progress: 70,
					message: '正在执行退款规则'
				}
			}
		}

		const details = await Promise.all(
			job.orderIds.map(async (orderId) => {
				const result = await this.previewRefund(
					principal,
					orderId,
					'批量审核'
				)
				return {
					orderId,
					eligible: result.ok ? result.preview.eligible : false,
					manualReview: result.ok
						? result.preview.manualReview
						: false,
					conclusion: result.ok
						? result.preview.conclusion
						: result.error.message
				}
			})
		)

		return {
			ok: true,
			job: {
				...jobView,
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
					rejected: details.filter((item) => !item.eligible)
						.length,
					details
				}
			}
		}
	}

	async cancelBatchReview(
		principal: Principal,
		jobId: string
	): Promise<BusinessResult<{ job: Record<string, unknown> }>> {
		if (principal.role !== 'finance') {
			return businessError(
				'FORBIDDEN',
				'只有财务角色可以取消批量退款审核'
			)
		}

		const snapshot = await this.getJobSnapshot(principal, jobId)
		if (!snapshot.ok) return snapshot
		if (snapshot.job.status === 'completed') {
			return businessError(
				'JOB_ALREADY_COMPLETED',
				'任务已经完成，无法取消'
			)
		}

		const cancelledAt = new Date()
		const result = await this.database.db
			.collection<ReviewJobDocument>('review_jobs')
			.updateOne(
				{
					_id: jobId,
					tenantId: principal.tenantId
				},
				{
					$set: {
						status: 'cancelled',
						cancelledAt
					}
				}
			)

		if (result.matchedCount === 0) {
			return businessError('JOB_NOT_FOUND', `没有找到任务 ${jobId}`)
		}

		await this.appendAudit(
			principal,
			'cancel_batch_review',
			jobId
		)

		return this.getJobSnapshot(principal, jobId)
	}

	async getAuditLogs(principal: Principal): Promise<AuditLog[]> {
		const documents = await this.database.db
			.collection<AuditLogDocument>('audit_logs')
			.find({ tenantId: principal.tenantId })
			.sort({ createdAt: -1 })
			.limit(20)
			.toArray()

		return documents.reverse().map(toAuditLog)
	}

	private async appendAudit(
		principal: Principal,
		action: string,
		targetId: string,
		detail: Record<string, unknown> = {}
	) {
		await this.database.db
			.collection<AuditLogDocument>('audit_logs')
			.insertOne({
				_id: randomUUID(),
				tenantId: principal.tenantId,
				userId: principal.userId,
				action,
				targetId,
				detail,
				createdAt: new Date()
			})
	}
}
