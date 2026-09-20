import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module.js'
import { AfterSalesService } from '../after-sales/after-sales.service.js'
import { AuthService } from '../auth/auth.service.js'
import { McpClientService } from './client/mcp-client.service.js'
import { McpHostService } from './host/mcp-host.service.js'
import { McpTransportController } from './host/mcp-transport.controller.js'
import { McpTransportService } from './host/mcp-transport.service.js'
import { AfterSalesMcpServerFactory } from './server/after-sales-mcp-server.factory.js'

@Module({
	imports: [DatabaseModule],
	controllers: [McpTransportController],
	providers: [
		AfterSalesService,
		AuthService,
		McpClientService,
		AfterSalesMcpServerFactory,
		McpHostService,
		McpTransportService
	],
	exports: [McpHostService]
})
export class McpModule {}
