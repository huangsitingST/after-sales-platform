import { createRequestStateCodec } from '@modelcontextprotocol/server'

export const requestStateCodec = createRequestStateCodec({
	key:
		process.env.REQUEST_STATE_SECRET ??
		'course-demo-request-state-secret-2026-change-me',
	ttlSeconds: 300,
	bind: (context: any) =>
		`${context.mcpReq.method}\0${context.http?.authInfo?.clientId ?? 'anonymous'}`
})
