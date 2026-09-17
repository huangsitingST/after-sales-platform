import type {
	ElicitationDecision,
	McpResourceResult,
	McpToolDescriptor,
	McpToolResult
} from './shared.types.js'

export interface ListToolsInput {
	token: string
}

export interface CallToolInput {
	token: string
	name: string
	arguments: Record<string, unknown>
	decision?: ElicitationDecision
}

export interface ReadResourceInput {
	token: string
	uri: string
}

export interface McpResultResponse {
	kind: 'result'
	result: McpToolResult
}

export interface McpElicitationResponse {
	kind: 'elicitation'
	message: string
}

export type McpCallResponse = McpResultResponse | McpElicitationResponse

export interface McpHostContract {
	listTools(input: ListToolsInput): Promise<{ tools: McpToolDescriptor[] }>
	callTool(input: CallToolInput): Promise<McpCallResponse>
	readResource(input: ReadResourceInput): Promise<McpResourceResult>
}
