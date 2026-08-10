import { nextTestSetup } from 'e2e-utils'

describe('development HMR refresh', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // see issue #22099
  it('page should not reload when the file is not changed', async () => {
    const browser = await next.browser('/with+Special&Chars=')

    await browser.eval(`window.doesNotReloadCheck = true`)

    await new Promise<void>((resolve) => setTimeout(resolve, 10000))

    expect(await browser.eval('window.doesNotReloadCheck')).toBe(true)
  })
})
