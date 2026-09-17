function sanitizeCspDomains(domains: unknown) {
	if (!Array.isArray(domains)) return []
	return domains.filter(
		(domain): domain is string =>
			typeof domain === 'string' &&
			!/[;\r\n'" ]/.test(domain)
	)
}

export function buildSandboxCsp(
	csp: {
		resourceDomains?: unknown
		connectDomains?: unknown
		frameDomains?: unknown
		baseUriDomains?: unknown
	} = {}
) {
	const resourceDomains = sanitizeCspDomains(csp.resourceDomains).join(' ')
	const connectDomains = sanitizeCspDomains(csp.connectDomains).join(' ')
	const frameDomains = sanitizeCspDomains(csp.frameDomains).join(' ')
	const baseUriDomains = sanitizeCspDomains(csp.baseUriDomains).join(' ')

	return [
		"default-src 'self' 'unsafe-inline'",
		`script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: ${resourceDomains}`.trim(),
		`style-src 'self' 'unsafe-inline' blob: data: ${resourceDomains}`.trim(),
		`img-src 'self' data: blob: ${resourceDomains}`.trim(),
		`font-src 'self' data: blob: ${resourceDomains}`.trim(),
		`connect-src 'self' ${connectDomains}`.trim(),
		frameDomains ? `frame-src ${frameDomains}` : "frame-src 'none'",
		"object-src 'none'",
		baseUriDomains ? `base-uri ${baseUriDomains}` : "base-uri 'none'"
	].join('; ')
}
