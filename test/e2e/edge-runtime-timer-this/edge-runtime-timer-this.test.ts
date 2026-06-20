import { nextTestSetup } from 'e2e-utils'

const enableCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('edge-runtime-timer-this', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // This is testing the edge runtime sandbox, which is only used in `next start`.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (enableCacheComponents) {
    it.skip('skipped because `runtime = "edge"` is not allowed in cacheComponents', () => {})
    return
  }

  it('should not expose the outer globalThis to edge runtime callbacks', async () => {
    const res = await next.fetch('/')
    const text = await res.text()

    // If the sandbox is escaped, the route resolves with exactly "escape successful"
    // after writing a file via the outer process. It should instead fail to
    // reach the outer globalThis and resolve with "escape failed:" plus the error.
    expect(await next.hasFile('hello.txt')).toBe(false)
    expect(text).not.toBe('escape successful')

    expect(text).toMatchInlineSnapshot(`
     "escape failed:
     TypeError: Cannot read properties of undefined (reading 'require')"
    `)
  })
})
