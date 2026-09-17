import type {
	ElicitationDecision,
	McpResourceResult,
	McpToolDescriptor,
	McpToolResult
} from './shared.types.js'

export interface McpClientSession {
	listTools(): Promise<{ tools: McpToolDescriptor[] }>
	callTool(input: {
		name: string
		arguments: Record<string, unknown>
	}): Promise<McpToolResult>
	readResource(input: { uri: string }): Promise<McpResourceResult>
	getPrompt(input: {
		name: string
		arguments: Record<string, string>
	}): Promise<{ messages: unknown[] }>
}

export interface WithMcpClientOptions {
	token: string
	autoConfirm?: boolean
	decision?: ElicitationDecision
	name?: string
}

export interface McpClientProvider {
	withClient<T>(
		options: WithMcpClientOptions,
		action: (client: McpClientSession) => Promise<T>
	): Promise<T>
}
