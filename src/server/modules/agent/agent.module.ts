import { Module } from '@nestjs/common'

import { McpModule } from '../mcp/mcp.module.js'
import { ModelModule } from '../model/model.module.js'
import { AgentController } from './agent.controller.js'
import { AgentService } from './agent.service.js'

@Module({
	imports: [McpModule, ModelModule],
	controllers: [AgentController],
	providers: [AgentService]
})
export class AgentModule {}
