const SENSITIVE_QUERY_PARAMS = new Set([
  'access_token',
  'code',
  'hub.verify_token',
  'hub_verify_token',
  'signature',
  'token',
])

export function redactRequestUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://localhost')

    for (const key of new Set(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[redacted]')
      }
    }

    return `${parsed.pathname}${parsed.search}`
  } catch {
    return '[invalid-url]'
  }
}
