import { Inject, Injectable } from '@nestjs/common'

import { DatabaseService } from '../database/database.service.js'
import type {
	AuthenticationResult,
	AuthServiceContract
} from './auth.contract.js'
import type { McpAuthInfo, Principal } from '../mcp/contracts/shared.types.js'

@Injectable()
export class AuthService implements AuthServiceContract {
	constructor(
		@Inject(DatabaseService)
		private readonly database: DatabaseService
	) {}

	async authenticate(
		authorizationHeader?: string
	): Promise<AuthenticationResult | null> {
		const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i)
		const token = match?.[1]
		const document = token
			? await this.database.db.collection('users').findOne({ token })
			: null

		if (!token || !document) return null

		const principal: Principal = {
			userId: String(document._id),
			name: String(document.name),
			tenantId: String(document.tenantId),
			role: document.role as Principal['role']
		}

		return {
			authInfo: {
				token,
				clientId: principal.userId,
				scopes: [principal.role]
			},
			principal
		}
	}

	async principalFromAuthInfo(
		authInfo?: McpAuthInfo
	): Promise<Principal | undefined> {
		if (!authInfo?.token) return undefined

		const document = await this.database.db
			.collection('users')
			.findOne({ token: authInfo.token })

		return document
			? {
					userId: String(document._id),
					name: String(document.name),
					tenantId: String(document.tenantId),
					role: document.role as Principal['role']
				}
			: undefined
	}
}
