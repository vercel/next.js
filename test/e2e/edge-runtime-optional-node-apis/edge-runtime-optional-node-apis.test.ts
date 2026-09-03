import { nextTestSetup } from 'e2e-utils'

describe('edge runtime optional Node.js APIs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('leaves process.getBuiltinModule undefined so feature detection can fall back', async () => {
    const res = await next.fetch('/api/optional-node-apis')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.detected).toBe(false)
    expect(body.present).toBe(false)
    expect(body.usedFallback).toBe(true)
  })

  it('still throws for Node.js APIs that are not optional', async () => {
    const res = await next.fetch('/api/optional-node-apis')
    const body = await res.json()

    expect(body.unsupportedApiError).toContain(
      'A Node.js API is used (process.cwd) which is not supported in the Edge Runtime'
    )
  })
})
