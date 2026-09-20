import 'dotenv/config'

import { DatabaseService } from './database.service.js'

const database = new DatabaseService()

try {
	await database.onModuleInit()
	const databaseName = process.env.MONGODB_DATABASE?.trim()
	console.log(`MongoDB 初始化完成：${databaseName}`)
} finally {
	await database.onModuleDestroy()
}
