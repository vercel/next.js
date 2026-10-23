import { nextTestSetup } from 'e2e-utils'

describe('async-module-late-dependent', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // @gate turbopack
  it('should not evaluate a dependent before its async dependency without top-level await has finished', async () => {
    const res = await next.fetch('/size')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      width: 1280,
      height: 720,
      ratio: '16:9',
    })
  })
})
