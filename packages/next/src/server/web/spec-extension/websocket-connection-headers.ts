/**
 * The RFC 9110 `token` grammar, shared by Connection member, header-name, and
 * WebSocket subprotocol validation.
 *
 * @internal
 */
export const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/**
 * Returns valid field names nominated by standard and legacy Connection
 * metadata. Invalid list members are ignored without hiding valid siblings.
 *
 * @internal
 */
export function getConnectionHeaderTokens(headers: Headers): Set<string> {
  const tokens = new Set<string>()
  for (const header of ['connection', 'proxy-connection']) {
    const value = headers.get(header)
    if (!value) continue
    for (const member of value.split(',')) {
      const token = member.trim()
      if (HTTP_TOKEN.test(token)) tokens.add(token.toLowerCase())
    }
  }
  return tokens
}
