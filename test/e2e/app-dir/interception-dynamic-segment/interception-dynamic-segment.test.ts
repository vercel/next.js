import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('interception-dynamic-segment', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should work when interception route is paired with a dynamic segment', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('[href="/foo/1"]').click()
    await check(() => browser.elementById('modal').text(), /intercepted/)
    await browser.refresh()
    await check(() => browser.elementById('modal').text(), '')
    await check(() => browser.elementById('children').text(), /not intercepted/)
  })

  if (isNextStart) {
    it('should correctly prerender segments with generateStaticParams', async () => {
      expect(next.cliOutput).toContain('/generate-static-params/a')
      const res = await next.fetch('/generate-static-params/a')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-nextjs-cache')).toBe('HIT')
    })
  }
})
