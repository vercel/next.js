import { escapeStringRegexp } from '../../escape-regexp'

// Cookie matchers and NextRequest disagree about repeated cookie names. An
// adapter must send these requests to the Go validator even when its ordinary
// conditions would skip the proxy. Match complete cookie names, not values.
export function getCookieConditionDuplicatePattern(name: string): string {
  const cookie = `\\s*${escapeStringRegexp(name)}\\s*(?:=[^;]*)?`
  return `(?:[^;]*;)*${cookie}(?:;[^;]*)*;${cookie}(?:;[^;]*)*`
}
