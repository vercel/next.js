import { readFileSync } from 'fs'
import { join } from 'path'
import {
  PEER_TOKEN_ENV,
  PEER_TOKEN_HEADER,
  createPeerToken,
} from 'next/dist/server/lib/peer-token'

const templates = join(__dirname, '../../crates/next-api/src/templates')

describe('peer-token', () => {
  it('creates a different 32-byte hex token each time', () => {
    const first = createPeerToken()
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(createPeerToken()).not.toBe(first)
  })

  // The Go worker templates can't import the TypeScript names, so they spell
  // them out. This keeps the two copies equal.
  it('uses the same names in the Go worker templates', () => {
    const main = readFileSync(join(templates, 'go_route_main.go'), 'utf8')
    expect(main).toContain(`os.Getenv("${PEER_TOKEN_ENV}")`)
    expect(main).toContain(`r.Header.Get("${PEER_TOKEN_HEADER}")`)
    for (const handler of ['go_route_handler.go', 'go_proxy_handler.go']) {
      expect(readFileSync(join(templates, handler), 'utf8')).toContain(
        `r.Header.Del("${PEER_TOKEN_HEADER}")`
      )
    }
  })
})
