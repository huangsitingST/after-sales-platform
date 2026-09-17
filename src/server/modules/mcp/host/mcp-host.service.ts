import { Inject, Injectable } from '@nestjs/common'

import type {
	CallToolInput,
	ListToolsInput,
	McpCallResponse,
	McpHostContract,
	ReadResourceInput
} from '../contracts/host.contract.js'
import type { McpClientProvider } from '../contracts/client.contract.js'
import {
	isElicitationRequiredError,
	McpClientService
} from '../client/mcp-client.service.js'

@Injectable()
export class McpHostService implements McpHostContract {
	private readonly client: McpClientProvider

	constructor(@Inject(McpClientService) client: McpClientService) {
		this.client = client
	}

	async listTools({ token }: ListToolsInput) {
		return this.client.withClient({ token, decision: 'prompt' }, (client) =>
			client.listTools()
		)
	}

	async callTool({
		token,
		name,
		arguments: args,
		decision = 'prompt'
	}: CallToolInput): Promise<McpCallResponse> {
		try {
			const result = await this.client.withClient(
				{ token, decision },
				(client) =>
					client.callTool({
						name,
						arguments: args
					})
			)

			return { kind: 'result', result }
		} catch (error) {
			if (isElicitationRequiredError(error)) {
				return {
					kind: 'elicitation',
					message: error.message
				}
			}

			throw error
		}
	}

	async readResource({ token, uri }: ReadResourceInput) {
		return this.client.withClient({ token, decision: 'prompt' }, (client) =>
			client.readResource({ uri })
		)
	}
}
