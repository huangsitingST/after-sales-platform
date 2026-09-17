import type { McpAuthInfo, Principal } from '../mcp/contracts/shared.types.js'

export interface AuthenticationResult {
	authInfo: McpAuthInfo
	principal: Principal
}

export interface AuthServiceContract {
	authenticate(authorizationHeader?: string): AuthenticationResult | null
	principalFromAuthInfo(authInfo?: McpAuthInfo): Principal | undefined
}
