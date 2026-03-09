import { ESCAPE_REGEX } from '../htmlescape'

export function getScriptNonceFromHeader(
  cspHeaderValue: string
): string | undefined {
  // CSP processing notes:
  // - Directives are ';'-separated; tokens inside are separated by arbitrary ASCII whitespace.
  // - Directive names are ASCII case-insensitive.
  // - Must match *exactly* 'script-src' (fallback to 'default-src'), not prefixes like 'script-src-attr/elem'.
  // - Nonce sources have the form: `'nonce-<value>'` (quotes included).

  if (!cspHeaderValue) return

  const directives = cspHeaderValue
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)

  type Parsed = { name: string; sources: string[] }

  const parsed: Parsed[] = directives.map((d) => {
    const tokens = d.split(/\s+/).filter(Boolean) // handle spaces/tabs/multiple spaces
    const name = (tokens[0] || '').toLowerCase()
    const sources = tokens.slice(1)
    return { name, sources }
  })

  // Prefer script-src; if absent, fall back to default-src
  const scriptSrc =
    parsed.find((p) => p.name === 'script-src') ??
    parsed.find((p) => p.name === 'default-src')

  if (!scriptSrc) return

  // Look for a token exactly like `'nonce-…'` and capture the value.
  const nonceToken = scriptSrc.sources.find((s) => /^'nonce-[^']+'$/.test(s))
  if (!nonceToken) return

  // Strip surrounding quotes and the 'nonce-' prefix
  const nonce = nonceToken.slice(1, -1).slice('nonce-'.length)

  // Defense-in-depth: reject values containing HTML escape characters
  if (ESCAPE_REGEX.test(nonce)) {
    throw new Error(
      'Nonce value from Content-Security-Policy contained HTML escape characters.\n' +
        'Learn more: https://nextjs.org/docs/messages/nonce-contained-invalid-characters'
    )
  }

  return nonce
}
