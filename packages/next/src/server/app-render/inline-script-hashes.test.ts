import { createHash } from 'crypto'

import {
  collectInlineScriptHashes,
  withInlineScriptHashes,
} from './inline-script-hashes'

const hashOf = (body: string) =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`

describe('collectInlineScriptHashes', () => {
  it('hashes the body of every inline script', () => {
    const html =
      '<html><body><script>self.__next_f.push([1,"a"])</script>' +
      '<script type="application/json">{"a":1}</script></body></html>'

    expect(collectInlineScriptHashes(html, 'sha256')).toEqual([
      hashOf('self.__next_f.push([1,"a"])'),
      hashOf('{"a":1}'),
    ])
  })

  it('skips scripts served from a URL and empty ones', () => {
    const html =
      '<script src="/_next/static/chunk.js"></script>' +
      '<script src="/other.js" defer></script>' +
      '<script></script>'

    expect(collectInlineScriptHashes(html, 'sha256')).toEqual([])
  })

  it('reports repeated bodies once', () => {
    const html = '<script>hydrate()</script><script>hydrate()</script>'

    expect(collectInlineScriptHashes(html, 'sha256')).toEqual([
      hashOf('hydrate()'),
    ])
  })
})

describe('withInlineScriptHashes', () => {
  const hashes = [hashOf('hydrate()')]

  it('adds the hashes to script-src', () => {
    expect(
      withInlineScriptHashes(`default-src 'self'; script-src 'self'`, hashes)
    ).toBe(`default-src 'self'; script-src 'self' ${hashes[0]}`)
  })

  it('prefers script-src-elem where the policy has one', () => {
    expect(
      withInlineScriptHashes(
        `script-src 'self'; script-src-elem 'self'`,
        hashes
      )
    ).toBe(`script-src 'self'; script-src-elem 'self' ${hashes[0]}`)
  })

  it('falls back to default-src', () => {
    expect(withInlineScriptHashes(`default-src 'self'`, hashes)).toBe(
      `default-src 'self' ${hashes[0]}`
    )
  })

  it('leaves a policy with unsafe-inline alone', () => {
    const policy = `script-src 'self' 'unsafe-inline'`

    expect(withInlineScriptHashes(policy, hashes)).toBe(policy)
  })

  it('leaves a policy without a governing directive alone', () => {
    const policy = `img-src 'self'`

    expect(withInlineScriptHashes(policy, hashes)).toBe(policy)
  })

  it('handles a header carrying several policies', () => {
    expect(
      withInlineScriptHashes(
        `script-src 'self', script-src 'self' 'unsafe-inline'`,
        hashes
      )
    ).toBe(`script-src 'self' ${hashes[0]}, script-src 'self' 'unsafe-inline'`)
  })

  it('returns the header untouched when there is nothing to add', () => {
    expect(withInlineScriptHashes(`script-src 'self'`, [])).toBe(
      `script-src 'self'`
    )
  })
})
