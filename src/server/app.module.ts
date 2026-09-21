import { Module } from '@nestjs/common'

import { AgentModule } from './modules/agent/agent.module.js'
import { HealthController } from './modules/health/health.controller.js'

@Module({
	imports: [AgentModule],
	controllers: [HealthController]
})
export class AppModule {}
