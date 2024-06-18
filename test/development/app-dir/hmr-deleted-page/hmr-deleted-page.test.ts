import { join } from 'path'

import { nextTestSetup, FileRef } from 'e2e-utils'
import { hasRedbox } from 'next-test-utils'
import { waitForHydration } from 'development-sandbox'

describe('hmr-deleted-page', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
  })

  it('should not show errors for a deleted page', async () => {
    const browser = await next.browser('/page')
    expect(await browser.elementByCss('p').text()).toBe('nested hello world')

    await next.deleteFile('app/page/test.tsx')
    await next.deleteFile('app/page/style.css')
    await waitForHydration(browser)

    expect(await hasRedbox(browser)).toBe(true)

    await next.deleteFile('app/page')
    await waitForHydration(browser)

    expect(await hasRedbox(browser)).toBe(false)
    expect(await browser.elementByCss('h1').text()).toBe('404')
  })
})
