import {
	Injectable,
	type OnModuleDestroy,
	type OnModuleInit
} from '@nestjs/common'
import { Db, MongoClient } from 'mongodb'

import { initializeDatabase } from './schema.js'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
	private client: MongoClient | null = null
	private database: Db | null = null

	async onModuleInit() {
		if (this.database) return

		const uri = process.env.MONGODB_URI?.trim()
		const databaseName = process.env.MONGODB_DATABASE?.trim()
		const serverSelectionTimeoutMS = Number(
			process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? 5000
		)

		if (!uri) {
			throw new Error('缺少环境变量 MONGODB_URI')
		}
		if (!databaseName) {
			throw new Error('缺少环境变量 MONGODB_DATABASE')
		}

		const client = new MongoClient(uri, {
			appName: 'enterprise-after-sales-mcp',
			serverSelectionTimeoutMS
		})

		await client.connect()
		const database = client.db(databaseName)
		await database.command({ ping: 1 })
		await initializeDatabase(database)
		this.client = client
		this.database = database
	}

	async onModuleDestroy() {
		await this.client?.close()
		this.client = null
		this.database = null
	}

	get db(): Db {
		if (!this.database) {
			throw new Error('MongoDB 尚未初始化')
		}
		return this.database
	}
}
