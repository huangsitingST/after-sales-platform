import { Controller, Get } from '@nestjs/common'

@Controller('api')
export class RuntimeController {
	@Get('config')
	getConfig() {
		const sandboxPort = Number(
			process.env.WEB_SANDBOX_PORT ?? 3201
		)

		return {
			sandboxUrl: `http://127.0.0.1:${sandboxPort}/sandbox.html`
		}
	}
}
