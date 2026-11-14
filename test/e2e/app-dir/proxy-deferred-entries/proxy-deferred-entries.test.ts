import { nextTestSetup } from 'e2e-utils'

describe('proxy-deferred-entries', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should compile deferred entries after a request that runs the proxy', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const deferredRes = await next.fetch('/deferred')
    expect(deferredRes.status).toBe(200)
    expect(await deferredRes.text()).toContain('deferred')
  })
})
