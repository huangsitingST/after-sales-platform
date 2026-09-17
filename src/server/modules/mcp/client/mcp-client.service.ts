import { Injectable } from '@nestjs/common'
import {
	Client,
	StreamableHTTPClientTransport
} from '@modelcontextprotocol/client'

import type {
	McpClientProvider,
	McpClientSession,
	WithMcpClientOptions
} from '../contracts/client.contract.js'
import type {
	ElicitationDecision,
	McpResourceResult,
	McpToolResult
} from '../contracts/shared.types.js'
import { ElicitationRequiredError } from './elicitation-required.error.js'

@Injectable()
export class McpClientService implements McpClientProvider {
	async withClient<T>(
		{
			token,
			autoConfirm = false,
			decision = 'prompt',
			name = 'enterprise-after-sales-client'
		}: WithMcpClientOptions,
		action: (client: McpClientSession) => Promise<T>
	): Promise<T> {
		const client = this.createClient(name)

		client.setRequestHandler('elicitation/create', async (request: any) => {
			if (autoConfirm || decision === 'accept') {
				return {
					action: 'accept',
					content: { confirm: true }
				}
			}

			if (decision === 'decline') {
				return { action: 'decline' }
			}

			throw new ElicitationRequiredError(request.params.message)
		})

		const transport = new StreamableHTTPClientTransport(
			new URL(
				process.env.MCP_SERVER_URL ?? 'http://127.0.0.1:3100/mcp'
			),
			{ authProvider: { token: async () => token } }
		)

		await client.connect(transport)

		try {
			return await action(client as unknown as McpClientSession)
		} finally {
			await client.close()
		}
	}

	private createClient(name: string) {
		return new Client(
			{ name, version: '1.0.0' },
			{
				versionNegotiation: { mode: 'auto' },
				capabilities: {
					elicitation: { form: {} },
					extensions: {
						'io.modelcontextprotocol/ui': {
							mimeTypes: ['text/html;profile=mcp-app']
						}
					}
				}
			}
		)
	}
}

export function isElicitationRequiredError(
	error: unknown
): error is ElicitationRequiredError {
	return error instanceof ElicitationRequiredError
}

export type { ElicitationDecision, McpResourceResult, McpToolResult }
