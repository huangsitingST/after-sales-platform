import { randomUUID } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { MongoServerError } from 'mongodb'

import { DatabaseService } from '../database/database.service.js'
import type { Principal } from '../mcp/contracts/shared.types.js'

/** 售后业务统一返回的错误结构。 */
interface BusinessError {
	ok: false
	error: {
		code: string
		message: string
	}
}

/** 售后业务返回值：成功时直接展开业务数据，失败时返回可识别的错误码和提示。 */
type BusinessResult<T> = ({ ok: true } & T) | BusinessError

/** 订单集合中持久化的订单文档。 */
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

/** 物流集合中持久化的物流文档。 */
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

/** 售后规则集合中持久化的规则文档。 */
interface PolicyDocument {
	_id: string
	tenantId: string
	code: string
	title: string
	content: string
}

/** 退款申请集合中持久化的退款单文档。 */
interface RefundRequestDocument {
	_id: string
	/** 由租户 ID 和客户端幂等键组合而成，用于保证提交退款操作幂等。 */
	idempotencyId: string
	tenantId: string
	orderId: string
	amount: number
	reason: string
	status: 'manual_review' | 'approved'
	createdBy: string
	createdAt: Date
}

/** 批量退款审核任务文档；任务状态和时间用于计算对外展示的进度。 */
interface ReviewJobDocument {
	_id: string
	tenantId: string
	orderIds: string[]
	status: 'working' | 'completed' | 'cancelled'
	createdBy: string
	createdAt: Date
	cancelledAt: Date | null
}

/** 审计日志集合中持久化的日志文档。 */
interface AuditLogDocument {
	_id: string
	tenantId: string
	userId: string
	action: string
	targetId: string
	detail: Record<string, unknown>
	createdAt: Date
}

/** 返回给调用方的退款单结构，日期统一转换为 ISO 字符串。 */
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

/** 返回给调用方的审计日志结构。 */
interface AuditLog {
	auditId: string
	tenantId: string
	userId: string
	action: string
	targetId: string
	detail: Record<string, unknown>
	createdAt: string
}

/** 对外的订单、物流和规则结构不暴露数据库内部主键 `_id`。 */
type Order = Omit<OrderDocument, '_id'>
type Logistics = Omit<LogisticsDocument, '_id'>
type Policy = Omit<PolicyDocument, '_id'>

/** 创建统一的业务失败结果。 */
function businessError(code: string, message: string): BusinessError {
	return { ok: false, error: { code, message } }
}

/** 移除订单文档的数据库主键，得到对外返回结构。 */
function toOrder(document: OrderDocument): Order {
	const { _id: _ignored, ...order } = document
	return order
}

/** 移除物流文档的数据库主键，得到对外返回结构。 */
function toLogistics(document: LogisticsDocument): Logistics {
	const { _id: _ignored, ...logistics } = document
	return logistics
}

/** 移除规则文档的数据库主键，得到对外返回结构。 */
function toPolicy(document: PolicyDocument): Policy {
	const { _id: _ignored, ...policy } = document
	return policy
}

/** 将退款单文档转换为对外结构，并转换日期格式。 */
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

/** 将审计日志文档转换为对外结构，并转换日期格式。 */
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

/** 提供售后订单、物流、规则、退款和批量审核相关的数据访问与业务规则。 */
@Injectable()
export class AfterSalesService {
	constructor(
		@Inject(DatabaseService)
		private readonly database: DatabaseService
	) {}

	/** 按租户和订单号查询订单，避免跨租户读取数据。 */
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

	/** 查询订单物流；先确认订单在当前租户下存在，再读取物流记录。 */
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

	/** 按规则编码查询当前租户下的售后规则。 */
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

	/**
	 * 在当前租户的规则中执行简单关键词检索。
	 * 查询词按空白和常见中文标点拆分，规则标题和内容命中的关键词越多，得分越高。
	 */
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

	/**
	 * 根据订单状态、商品类型、签收天数和退款金额生成退款预览。
	 * 不满足硬性条件时直接判定不可退款；金额超过阈值时仍可退款，但转入人工审核。
	 */
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

		// 按业务优先级依次判断，前面的不可退款条件不会再进入金额审核分支。
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

	/**
	 * 提交退款申请。
	 * 使用租户级幂等键防止重复提交，并在并发插入触发唯一索引冲突时返回已有退款单。
	 */
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
		// 幂等键加入租户前缀，避免不同租户使用相同客户端幂等键时互相冲突。
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

		// 写入前先按当前订单状态重新执行退款规则，避免客户端绕过预览校验。
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
			// 唯一索引冲突通常来自并发重复提交。优先按幂等键返回原退款单；
			// 若冲突来自订单唯一索引，则说明该订单已经存在其他退款申请。
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

		// 只有真正创建退款单后才记录审计日志，重复请求会直接返回已有结果。
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

	/** 按租户和幂等键查询已有退款单。 */
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

	/** 按租户和订单号查询退款单，用于识别同一订单的重复退款。 */
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

	/**
	 * 创建批量退款审核任务。
	 * 仅财务角色可操作；创建前会校验全部订单都属于当前租户，任务创建后记录审计日志。
	 */
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

	/**
	 * 获取批量审核任务快照。
	 * 未取消的任务根据创建后的经过时间返回模拟进度，超过阈值后实时计算审核结果。
	 */
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

		// 任务没有后台执行器，前 1.6 秒通过时间窗口模拟读取和规则执行阶段。
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

		// 并发执行每个订单的退款预览，再汇总为自动通过、人工审核和拒绝数量。
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

	/** 取消尚未完成的批量审核任务，并将取消时间和取消操作写入审计日志。 */
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

	/** 查询当前租户最近 20 条审计日志，并按时间正序返回。 */
	async getAuditLogs(principal: Principal): Promise<AuditLog[]> {
		const documents = await this.database.db
			.collection<AuditLogDocument>('audit_logs')
			.find({ tenantId: principal.tenantId })
			.sort({ createdAt: -1 })
			.limit(20)
			.toArray()

		// 数据库先按时间倒序取最近记录，反转后得到从旧到新的展示顺序。
		return documents.reverse().map(toAuditLog)
	}

	/** 写入一条当前租户下的审计日志。 */
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
