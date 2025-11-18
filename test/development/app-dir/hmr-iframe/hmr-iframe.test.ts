import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('hmr-iframe', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should do HMR when rendering two server component changes at the same time', async () => {
    let browser = await next.browser('/page1')

    expect(
      await (await (await browser.elementByCss('iframe')).contentFrame())
        .locator('p')
        .innerText()
    ).toEqual('content')

    await next.patchFile('app/page2/page.tsx', (content) =>
      content.replace('content', 'content-new')
    )

    await waitForNoRedbox(browser)
    expect(
      await (await (await browser.elementByCss('iframe')).contentFrame())
        .locator('p')
        .innerText()
    ).toEqual('content-new')

    expect(next.cliOutput).not.toContain('Error')
    expect(next.cliOutput).not.toContain('Could not find the module')

    await next.stop()
    await next.clean()
  })
})
