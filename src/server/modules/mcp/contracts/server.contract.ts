import type { Principal } from './shared.types.js'

export interface McpServerContext {
	principal: Principal
	appHtml: string
}

export interface McpServerFactory<TServer = unknown> {
	create(context: McpServerContext): TServer
}
