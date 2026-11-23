import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('proxy-preload-on-start', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('loads the proxy before the first request', async () => {
    // `next.cliOutput` includes `next build` too, so only look after `Ready in`.
    await retry(async () => {
      expect(next.cliOutput.split('Ready in')[1]).toContain(
        'proxy:module-evaluated'
      )
    })

    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello')
  })
})
