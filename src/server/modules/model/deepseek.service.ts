import { Injectable } from '@nestjs/common'

import type {
	ModelMessage,
	ModelTool
} from '../mcp/contracts/shared.types.js'

const apiUrl =
	process.env.DEEPSEEK_BASE_URL ??
	'https://api.deepseek.com/chat/completions'

@Injectable()
export class DeepSeekService {
	readonly modelName = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

	async call({
		messages,
		tools
	}: {
		messages: ModelMessage[]
		tools: ModelTool[]
	}): Promise<ModelMessage> {
		if (!process.env.DEEPSEEK_API_KEY) {
			throw new Error('缺少 DEEPSEEK_API_KEY，请先在 .env 中完成配置')
		}

		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.modelName,
				messages,
				tools,
				tool_choice: 'auto',
				thinking: { type: 'disabled' },
				temperature: 0.1
			})
		})

		const data = (await response.json()) as {
			choices?: Array<{ message?: ModelMessage }>
		}

		if (!response.ok) {
			throw new Error(
				`DeepSeek 调用失败：${response.status} ${JSON.stringify(data)}`
			)
		}

		const message = data.choices?.[0]?.message
		if (!message) throw new Error('DeepSeek 没有返回有效消息')
		return message
	}
}
