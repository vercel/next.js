import { nextTestSetup } from 'e2e-utils'
import { waitForStaticIndicator } from 'next-test-utils'

describe('app dir dev indicator - route type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have route type as static by default for static page', async () => {
    const browser = await next.browser('/')

    await waitForStaticIndicator(browser, 'Static')
  })

  it('should have route type as dynamic when changing to dynamic page', async () => {
    const browser = await next.browser('/')
    const origContent = await next.readFile('app/page.tsx')

    await next.patchFile(
      'app/page.tsx',
      origContent.replace('// headers()', 'headers()')
    )

    try {
      await waitForStaticIndicator(browser, 'Dynamic')
    } finally {
      await next.patchFile('app/page.tsx', origContent)
    }
  })

  it('should have route type as dynamic when on load of dynamic page', async () => {
    const origContent = await next.readFile('app/page.tsx')

    await next.patchFile(
      'app/page.tsx',
      origContent.replace('// headers()', 'headers()')
    )

    const browser = await next.browser('/')

    try {
      await waitForStaticIndicator(browser, 'Dynamic')
    } finally {
      await next.patchFile('app/page.tsx', origContent)
    }
  })

  it('should have route type as dynamic when using force-dynamic', async () => {
    const browser = await next.browser('/force-dynamic')

    await browser.waitForElementByCss('#ready')

    await waitForStaticIndicator(browser, 'Dynamic')
  })
})
