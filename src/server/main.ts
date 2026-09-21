import 'reflect-metadata'
import 'dotenv/config'

import { resolve } from 'node:path'

import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'

import { AppModule } from './app.module.js'

const hostName = '127.0.0.1'
const hostPort = Number(process.env.PORT ?? 3100)
const webDist = resolve(process.cwd(), 'dist-web-host')
const webIndex = resolve(webDist, 'index.html')

const hostApp = await NestFactory.create<NestExpressApplication>(
	AppModule,
	{ bodyParser: false }
)

hostApp.use('/api', express.json({ limit: '1mb' }))
hostApp.useStaticAssets(webDist, { index: false })
hostApp.use((request: Request, response: Response, next: NextFunction) => {
	const acceptsHtml = request.headers.accept?.includes('text/html')
	if (
		request.method === 'GET' &&
		acceptsHtml &&
		!request.path.startsWith('/api') &&
		request.path !== '/mcp'
	) {
		response.sendFile(webIndex)
		return
	}
	next()
})

hostApp.enableShutdownHooks()
await hostApp.init()

await hostApp.listen(hostPort, hostName)

console.log(
	`企业售后 MCP Host：http://${hostName}:${hostPort}`
)
console.log(
	`MCP Server：http://${hostName}:${hostPort}/mcp`
)

let shuttingDown = false

async function shutdown() {
	if (shuttingDown) return
	shuttingDown = true
	await hostApp.close()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
