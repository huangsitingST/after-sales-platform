export async function postJson<T>(
	url: string,
	body: Record<string, unknown>
): Promise<T> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	})

	const data = (await response.json()) as {
		error?: string
		message?: string
	}

	if (!response.ok) {
		throw new Error(data.error ?? data.message ?? `请求失败：${response.status}`)
	}

	return data as T
}
