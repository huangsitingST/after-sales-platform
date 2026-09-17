import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { App } from '@modelcontextprotocol/ext-apps'

import type { ReviewReport } from '../types'

export function useMcpApp() {
	const report = shallowRef<ReviewReport>()
	let app: App | undefined

	onMounted(async () => {
		app = new App(
			{
				name: 'after-sales-review-report',
				version: '1.0.0'
			},
			{}
		)

		app.ontoolresult = (params) => {
			report.value = params.structuredContent as ReviewReport
		}

		await app.connect()
	})

	onBeforeUnmount(() => {
		void (app as App & { close?: () => Promise<void> })?.close?.()
	})

	return { report }
}
