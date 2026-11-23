import { readFileSync } from 'fs'
import type { IncomingMessage } from 'http'
import { join } from 'path'
import {
  PEER_TOKEN_ENV,
  PEER_TOKEN_HEADER,
  createPeerToken,
  takePeerToken,
} from 'next/dist/server/lib/peer-token'
import { CLIENT_ADDRESS_HEADER } from 'next/dist/server/lib/switchyard-connection'

const repo = join(__dirname, '../..')
const templates = join(repo, 'crates/next-api/src/templates')

/** How Go's net/http spells a header name. */
function canonical(name: string) {
  return name.replace(/(^|-)([a-z])/g, (_, dash, c) => dash + c.toUpperCase())
}

function request(rawHeaders: string[]) {
  const headers: IncomingMessage['headers'] = {}
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase()
    const previous = headers[name]
    headers[name] =
      previous === undefined
        ? rawHeaders[i + 1]
        : `${previous}, ${rawHeaders[i + 1]}`
  }
  return { headers, rawHeaders } satisfies Pick<
    IncomingMessage,
    'headers' | 'rawHeaders'
  >
}

describe('peer-token', () => {
  it('creates a different 32-byte hex token each time', () => {
    const first = createPeerToken()
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(createPeerToken()).not.toBe(first)
  })

  it.each([
    ['valid', ['X-Next-Internal-Peer-Token', 'secret']],
    ['missing', []],
    ['invalid', ['x-next-internal-peer-token', 'secreT']],
    ['invalid', ['x-next-internal-peer-token', 'short']],
    [
      'invalid',
      [
        'x-next-internal-peer-token',
        'secret',
        'x-next-internal-peer-token',
        'secret',
      ],
    ],
  ])('reads a %s token and removes it', (expected, token) => {
    const req = request(['Host', 'example.test', ...token, 'X-Kept', 'yes'])
    expect(takePeerToken(req, Buffer.from('secret'))).toBe(expected)
    expect(req.headers).toEqual({ host: 'example.test', 'x-kept': 'yes' })
    expect(req.rawHeaders).toEqual(['Host', 'example.test', 'X-Kept', 'yes'])
  })

  // The Go code can't import the TypeScript names, so it spells them out.
  // This keeps the copies equal.
  it('uses the same names in the Go worker templates and Switchyard', () => {
    const main = readFileSync(join(templates, 'go_route_main.go'), 'utf8')
    expect(main).toContain(`os.Getenv("${PEER_TOKEN_ENV}")`)
    expect(main).toContain(`r.Header.Get("${PEER_TOKEN_HEADER}")`)
    for (const handler of ['go_route_handler.go', 'go_proxy_handler.go']) {
      expect(readFileSync(join(templates, handler), 'utf8')).toContain(
        `r.Header.Del("${PEER_TOKEN_HEADER}")`
      )
    }
    const switchyard = readFileSync(
      join(repo, 'packages/next/src/server/switchyard/main.go'),
      'utf8'
    )
    expect(switchyard).toContain(
      `peerTokenHeader = "${canonical(PEER_TOKEN_HEADER)}"`
    )
    expect(switchyard).toContain(
      `clientAddressHeader = "${canonical(CLIENT_ADDRESS_HEADER)}"`
    )
  })
})
