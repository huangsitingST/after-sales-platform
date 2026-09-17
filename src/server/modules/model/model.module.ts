import { Module } from '@nestjs/common'

import { DeepSeekService } from './deepseek.service.js'

@Module({
	providers: [DeepSeekService],
	exports: [DeepSeekService]
})
export class ModelModule {}
