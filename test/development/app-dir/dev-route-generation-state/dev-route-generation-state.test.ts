import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dev-route-generation-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('removes generated interception rewrites with their route', async () => {
    const headers = { rsc: '1', 'next-url': '/' }
    const intercepted = await next.fetch('/feed', { headers })
    expect(await intercepted.text()).toContain('intercepted feed')

    await next.deleteFile('app/@modal/(.)feed/page.tsx')

    await retry(async () => {
      const direct = await next.fetch('/feed', { headers })
      const directBody = await direct.text()
      expect(direct.status).toBe(200)
      expect(directBody).toContain('direct feed')
      expect(directBody).not.toContain('intercepted feed')
    }, 15_000)
  })
})
