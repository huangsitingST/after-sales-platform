import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler } from '@modelcontextprotocol/server'

import { AuthService } from '../../auth/auth.service.js'
import { AfterSalesMcpServerFactory } from '../server/after-sales-mcp-server.factory.js'

@Injectable()
export class McpTransportService implements OnModuleDestroy {
	private readonly appHtml: string
	private readonly handler: ReturnType<typeof createMcpHandler>
	private readonly nodeHandler: (
		request: any,
		response: any
	) => Promise<void>

	constructor(
		@Inject(AuthService)
		private readonly auth: AuthService,
		@Inject(AfterSalesMcpServerFactory)
		factory: AfterSalesMcpServerFactory
	) {
		const appPath = resolve(
			process.cwd(),
			'dist/mcp-app/index.html'
		)
		this.appHtml = readFileSync(appPath, 'utf8')

		this.handler = createMcpHandler(
			async ({ authInfo }) => {
				const principal =
					await this.auth.principalFromAuthInfo(authInfo)
				if (!principal) throw new Error('MCP 请求缺少有效身份')

				return factory.create({
					principal,
					appHtml: this.appHtml
				})
			},
			{
				legacy: 'reject',
				responseMode: 'auto',
				onerror: (error) => console.error('[MCP]', error)
			}
		)

		this.nodeHandler = toNodeHandler(this.handler as never, {
			onerror: (error) => console.error('[HTTP Adapter]', error)
		}) as unknown as (request: any, response: any) => Promise<void>
	}

	handle(request: any, response: any) {
		return this.nodeHandler(request, response)
	}

	async onModuleDestroy() {
		await this.handler.close()
	}
}
