import 'reflect-metadata'
import 'dotenv/config'

import { basename, resolve } from 'node:path'

import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import express, {
	type NextFunction,
	type Request,
	type Response
} from 'express'

import { AppModule } from './app.module.js'
import { buildSandboxCsp } from './modules/sandbox/sandbox-csp.js'
import { SandboxModule } from './modules/sandbox/sandbox.module.js'

const hostName = '127.0.0.1'
const hostPort = Number(process.env.PORT ?? 3100)
const sandboxPort = Number(process.env.WEB_SANDBOX_PORT ?? 3201)
const webDist = resolve(process.cwd(), 'dist-web-host')
const webIndex = resolve(webDist, 'index.html')

const hostApp = await NestFactory.create<NestExpressApplication>(
	AppModule,
	{ bodyParser: false }
)

hostApp.use('/api', express.json({ limit: '1mb' }))
hostApp.use((request: Request, response: Response, next: NextFunction) => {
	if (request.path === '/sandbox.html') {
		response.status(404).end()
		return
	}
	next()
})

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

const sandboxApp = await NestFactory.create<NestExpressApplication>(
	SandboxModule,
	{ bodyParser: false, logger: false }
)

sandboxApp.use(
	(request: Request, response: Response, next: NextFunction) => {
	if (
		request.path === '/sandbox.html' ||
		request.path.startsWith('/assets/')
	) {
		next()
		return
	}
	response.status(404).end()
	}
)

sandboxApp.useStaticAssets(webDist, {
	index: false,
	setHeaders: (response, filePath) => {
		if (basename(filePath) !== 'sandbox.html') return

		let csp: Record<string, unknown> = {}
		try {
			const requestUrl = new URL(
				response.req?.url ?? '/',
				`http://${hostName}:${sandboxPort}`
			)
			csp = JSON.parse(requestUrl.searchParams.get('csp') ?? '{}')
		} catch {
			// 无效配置使用最严格的默认 CSP。
		}

		response.setHeader(
			'content-security-policy',
			buildSandboxCsp(csp)
		)
		response.setHeader('cache-control', 'no-store')
	}
})

await sandboxApp.init()

await hostApp.listen(hostPort, hostName)
await sandboxApp.listen(sandboxPort, hostName)

console.log(
	`企业售后 MCP Host：http://${hostName}:${hostPort}`
)
console.log(
	`MCP Server：http://${hostName}:${hostPort}/mcp`
)
console.log(
	`MCP App Sandbox：http://${hostName}:${sandboxPort}/sandbox.html`
)

let shuttingDown = false

async function shutdown() {
	if (shuttingDown) return
	shuttingDown = true
	await Promise.allSettled([hostApp.close(), sandboxApp.close()])
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
