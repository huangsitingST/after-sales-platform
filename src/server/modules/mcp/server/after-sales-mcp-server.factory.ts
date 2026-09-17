import { Inject, Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/server'

import { AfterSalesService } from '../../after-sales/after-sales.service.js'
import type {
	McpServerContext,
	McpServerFactory
} from '../contracts/server.contract.js'
import { registerCommonCapabilities } from './capabilities/common.capabilities.js'
import { registerFinanceCapabilities } from './capabilities/finance.capabilities.js'
import { requestStateCodec } from './request-state.js'

@Injectable()
export class AfterSalesMcpServerFactory implements McpServerFactory {
	constructor(
		@Inject(AfterSalesService)
		private readonly afterSales: AfterSalesService
	) {}

	create({ principal, appHtml }: McpServerContext) {
		const server = new McpServer(
			{
				name: 'enterprise-after-sales-mcp',
				version: '1.0.0'
			},
			{
				capabilities: {
					tools: {},
					resources: {},
					prompts: {}
				},
				requestState: {
					verify: requestStateCodec.verify
				}
			}
		)

		registerCommonCapabilities(server, principal, this.afterSales)

		if (principal.role === 'finance') {
			registerFinanceCapabilities(
				server,
				principal,
				appHtml,
				this.afterSales
			)
		}

		return server
	}
}
