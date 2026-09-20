import type { McpAuthInfo, Principal } from '../mcp/contracts/shared.types.js'

export interface AuthenticationResult {
	authInfo: McpAuthInfo
	principal: Principal
}

export interface AuthServiceContract {
	authenticate(
		authorizationHeader?: string
	): Promise<AuthenticationResult | null>
	principalFromAuthInfo(
		authInfo?: McpAuthInfo
	): Promise<Principal | undefined>
}
