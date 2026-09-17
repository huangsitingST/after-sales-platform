import { Injectable } from '@nestjs/common'

import { principalsByToken } from '../after-sales/data.js'
import type {
	AuthenticationResult,
	AuthServiceContract
} from './auth.contract.js'
import type { McpAuthInfo, Principal } from '../mcp/contracts/shared.types.js'

@Injectable()
export class AuthService implements AuthServiceContract {
	authenticate(authorizationHeader?: string): AuthenticationResult | null {
		const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i)
		const token = match?.[1]
		const principal = token ? principalsByToken.get(token) : undefined

		if (!token || !principal) return null

		return {
			authInfo: {
				token,
				clientId: principal.userId,
				scopes: [principal.role]
			},
			principal
		}
	}

	principalFromAuthInfo(authInfo?: McpAuthInfo): Principal | undefined {
		return authInfo?.token
			? principalsByToken.get(authInfo.token)
			: undefined
	}
}
