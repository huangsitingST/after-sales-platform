export function jsonResult(data: unknown, isError = false) {
	return {
		isError,
		structuredContent: data,
		content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
	}
}

export function businessResult(result: { ok: boolean }) {
	return jsonResult(result, result.ok === false)
}

export function cancelledResult(message: string) {
	return jsonResult(
		{ ok: false, error: { code: 'USER_CANCELLED', message } },
		true
	)
}
