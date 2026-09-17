import { All, Controller, Inject, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'

import { AuthService } from '../../auth/auth.service.js'
import { McpTransportService } from './mcp-transport.service.js'

@Controller('mcp')
export class McpTransportController {
	constructor(
		@Inject(AuthService)
		private readonly auth: AuthService,
		@Inject(McpTransportService)
		private readonly transport: McpTransportService
	) {}

	@All()
	async handle(@Req() request: Request, @Res() response: Response) {
		const auth = this.auth.authenticate(request.headers.authorization)

		if (!auth) {
			response.status(401).json({
				error: 'UNAUTHORIZED',
				message: '请提供有效的 Bearer Token'
			})
			return
		}

		;(request as Request & { auth?: typeof auth.authInfo }).auth =
			auth.authInfo

		await this.transport.handle(request, response)
	}
}
