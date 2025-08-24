import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('interception-segments-two-levels-above', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work when interception route is paired with segments two levels above', async () => {
    const browser = await next.browser('/foo/bar')

    await browser.elementByCss('[href="/hoge"]').click()
    await check(() => browser.elementById('intercepted').text(), /intercepted/)
  })
})
