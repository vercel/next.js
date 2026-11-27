import { nextTestSetup } from 'e2e-utils'

// `import defer` (https://github.com/tc39/proposal-defer-import-eval) is only
// implemented by Turbopack. The edge runtime has no async chunk loading.
// Edge Runtime is not supported with Cache Components.
// @force-gate turbopack && !cacheComponents
describe('import-defer-edge', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should defer import.defer() in the edge runtime', async () => {
    const res = await next.fetch('/edge-route')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      value: 'server-data',
      neverAccessed: 'object',
    })
  })
})
