import type { Db, Document, IndexDescription } from 'mongodb'

interface CollectionDefinition {
	name: string
	validator: Document
	indexes: IndexDescription[]
}

const collectionDefinitions: CollectionDefinition[] = [
	{
		name: 'users',
		validator: {
			bsonType: 'object',
			additionalProperties: false,
			required: [
				'_id',
				'tenantId',
				'name',
				'role',
				'token',
				'createdAt'
			],
			properties: {
				_id: { bsonType: 'string' },
				tenantId: { bsonType: 'string' },
				name: { bsonType: 'string' },
				role: {
					enum: ['customer_service', 'finance']
				},
				token: { bsonType: 'string' },
				createdAt: { bsonType: 'date' }
			}
		},
		indexes: [
			{ key: { token: 1 }, name: 'users_token_unique', unique: true },
			{
				key: { tenantId: 1, role: 1 },
				name: 'users_tenant_role'
			}
		]
	},
	{
		name: 'orders',
		validator: {
			bsonType: 'object',
			additionalProperties: false,
			required: [
				'_id',
				'tenantId',
				'orderId',
				'productName',
				'category',
				'amount',
				'status',
				'signedDays',
				'customerName'
			],
			properties: {
				_id: { bsonType: 'string' },
				tenantId: { bsonType: 'string' },
				orderId: { bsonType: 'string' },
				productName: { bsonType: 'string' },
				category: { enum: ['normal', 'fresh'] },
				amount: { bsonType: 'number', minimum: 0 },
				status: {
					enum: ['paid', 'shipped', 'delivered', 'closed']
				},
				signedDays: { bsonType: 'number', minimum: 0 },
				customerName: { bsonType: 'string' }
			}
		},
		indexes: [
			{
				key: { tenantId: 1, orderId: 1 },
				name: 'orders_tenant_order_unique',
				unique: true
			},
			{
				key: { tenantId: 1, status: 1 },
				name: 'orders_tenant_status'
			}
		]
	},
	{
		name: 'logistics',
		validator: {
			bsonType: 'object',
			additionalProperties: false,
			required: [
				'_id',
				'tenantId',
				'orderId',
				'company',
				'trackingNo',
				'events'
			],
			properties: {
				_id: { bsonType: 'string' },
				tenantId: { bsonType: 'string' },
				orderId: { bsonType: 'string' },
				company: { bsonType: 'string' },
				trackingNo: { bsonType: 'string' },
				events: {
					bsonType: 'array',
					minItems: 1,
					items: {
						bsonType: 'object',
						additionalProperties: false,
						required: ['time', 'message'],
						properties: {
							time: { bsonType: 'string' },
							message: { bsonType: 'string' }
						}
					}
				}
			}
		},
		indexes: [
			{
				key: { tenantId: 1, orderId: 1 },
				name: 'logistics_tenant_order_unique',
				unique: true
			},
			{
				key: { trackingNo: 1 },
				name: 'logistics_tracking_no'
			}
		]
	},
	{
		name: 'policies',
		validator: {
			bsonType: 'object',
			additionalProperties: false,
			required: [
				'_id',
				'tenantId',
				'code',
				'title',
				'content'
			],
			properties: {
				_id: { bsonType: 'string' },
				tenantId: { bsonType: 'string' },
				code: { bsonType: 'string' },
				title: { bsonType: 'string' },
				content: { bsonType: 'string' }
			}
		},
		indexes: [
			{
				key: { tenantId: 1, code: 1 },
				name: 'policies_tenant_code_unique',
				unique: true
			}
		]
	},
	{
		name: 'refund_requests',
		validator: {
			bsonType: 'object',
			additionalProperties: false,
			required: [
				'_id',
				'idempotencyId',
				'tenantId',
				'orderId',
				'amount',
				'reason',
				'status',
				'createdBy',
				'createdAt'
			],
			properties: {
				_id: { bsonType: 'string' },
				idempotencyId: { bsonType: 'string' },
				tenantId: { bsonType: 'string' },
				orderId: { bsonType: 'string' },
				amount: { bsonType: 'number', minimum: 0 },
				reason: { bsonType: 'string' },
				status: { enum: ['manual_review', 'approved'] },
				createdBy: { bsonType: 'string' },
				createdAt: { bsonType: 'date' }
			}
		},
		indexes: [
			{
				key: { idempotencyId: 1 },
				name: 'refund_requests_idempotency_unique',
				unique: true
			},
			{
				key: { tenantId: 1, orderId: 1 },
				name: 'refund_requests_tenant_order_unique',
				unique: true
			},
			{
				key: { tenantId: 1, createdAt: -1 },
				name: 'refund_requests_tenant_created'
			}
		]
	},
	{
		name: 'review_jobs',
		validator: {
			bsonType: 'object',
			additionalProperties: false,
			required: [
				'_id',
				'tenantId',
				'orderIds',
				'status',
				'createdBy',
				'createdAt',
				'cancelledAt'
			],
			properties: {
				_id: { bsonType: 'string' },
				tenantId: { bsonType: 'string' },
				orderIds: {
					bsonType: 'array',
					minItems: 1,
					items: { bsonType: 'string' }
				},
				status: { enum: ['working', 'completed', 'cancelled'] },
				createdBy: { bsonType: 'string' },
				createdAt: { bsonType: 'date' },
				cancelledAt: {
					bsonType: ['date', 'null']
				}
			}
		},
		indexes: [
			{
				key: { tenantId: 1, createdAt: -1 },
				name: 'review_jobs_tenant_created'
			},
			{
				key: { status: 1 },
				name: 'review_jobs_status'
			}
		]
	},
	{
		name: 'audit_logs',
		validator: {
			bsonType: 'object',
			additionalProperties: false,
			required: [
				'_id',
				'tenantId',
				'userId',
				'action',
				'targetId',
				'detail',
				'createdAt'
			],
			properties: {
				_id: { bsonType: 'string' },
				tenantId: { bsonType: 'string' },
				userId: { bsonType: 'string' },
				action: { bsonType: 'string' },
				targetId: { bsonType: 'string' },
				detail: { bsonType: 'object' },
				createdAt: { bsonType: 'date' }
			}
		},
		indexes: [
			{
				key: { tenantId: 1, createdAt: -1 },
				name: 'audit_logs_tenant_created'
			},
			{
				key: { tenantId: 1, userId: 1 },
				name: 'audit_logs_tenant_user'
			}
		]
	}
]

async function ensureCollections(db: Db) {
	const existingCollections = new Set(
		(await db.listCollections({}, { nameOnly: true }).toArray()).map(
			(collection) => collection.name
		)
	)

	for (const definition of collectionDefinitions) {
		if (!existingCollections.has(definition.name)) {
			await db.createCollection(definition.name, {
				validator: { $jsonSchema: definition.validator },
				validationLevel: 'strict',
				validationAction: 'error'
			})
		} else {
			await db.command({
				collMod: definition.name,
				validator: { $jsonSchema: definition.validator },
				validationLevel: 'strict',
				validationAction: 'error'
			})
		}

		await db
			.collection(definition.name)
			.createIndexes(definition.indexes)
	}
}

export async function initializeDatabase(db: Db) {
	await ensureCollections(db)
}
