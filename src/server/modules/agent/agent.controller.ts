import { Body, Controller, Inject, Param, Post } from '@nestjs/common'

import type {
	AgentConfirmationInput,
	AgentMessageInput,
	CreateAgentSessionInput
} from './agent.contract.js'
import { AgentService } from './agent.service.js'

@Controller('api/agent')
export class AgentController {
	constructor(
		@Inject(AgentService)
		private readonly agent: AgentService
	) {}

	@Post('sessions')
	createSession(@Body() body: CreateAgentSessionInput) {
		return this.agent.createSession(body?.token)
	}

	@Post('sessions/:sessionId/messages')
	sendMessage(
		@Param('sessionId') sessionId: string,
		@Body() body: AgentMessageInput
	) {
		return this.agent.sendMessage(sessionId, body)
	}

	@Post('sessions/:sessionId/app-demo')
	runAppDemo(@Param('sessionId') sessionId: string) {
		return this.agent.runAppDemo(sessionId)
	}

	@Post('confirmations/:confirmationId')
	resolveConfirmation(
		@Param('confirmationId') confirmationId: string,
		@Body() body: AgentConfirmationInput
	) {
		return this.agent.resolveConfirmation(confirmationId, body)
	}
}
