import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('hmr-app-and-pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should do HMR when app router and pages router have shared CSS', async () => {
    let browser = await next.browser('/')
    await browser.eval('window.notReloaded = true')

    expect(
      await browser.elementByCss('body').getComputedCss('background-color')
    ).toEqual('rgb(255, 255, 255)')

    await next.patchFile('app/styles.css', (content) =>
      content.replace(
        'background-color: rgb(255, 255, 255);',
        'background-color: rgb(255, 0, 0);'
      )
    )

    await waitForNoRedbox(browser)
    expect(
      await browser.elementByCss('body').getComputedCss('background-color')
    ).toEqual('rgb(255, 0, 0)')
    expect(await browser.eval('window.notReloaded')).toBe(true)

    browser = await next.browser('/pages-router')
    await browser.eval('window.notReloaded = true')

    expect(
      await browser.elementByCss('body').getComputedCss('background-color')
    ).toEqual('rgb(255, 0, 0)')

    await next.patchFile('app/styles.css', (content) =>
      content.replace(
        'background-color: rgb(255, 0, 0);',
        'background-color: rgb(255, 255, 255);'
      )
    )

    await waitForNoRedbox(browser)
    expect(
      await browser.elementByCss('body').getComputedCss('background-color')
    ).toEqual('rgb(255, 255, 255)')
    expect(await browser.eval('window.notReloaded')).toBe(true)

    await next.stop()
    await next.clean()
  })
})
