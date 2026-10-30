import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'

describe('parallel-route-not-found', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  function expectNoErrors() {
    // FIXME: Remove the DEP0144 allowance once require-cache stops using module.parent.
    const output = next.cliOutput.replace(
      /^\(node:\d+\) \[DEP0144\] DeprecationWarning: module\.parent[^\r\n]*(?:\r?\n[ \t]+at [^\r\n]*)*\r?\n?/gm,
      ''
    )
    expect(output).not.toMatch(/TypeError|Warning/)
  }

  it('should behave correctly without any errors', async () => {
    const browser = await next.browser('/en')

    // Deploy doesn't have access to runtime logs
    if (!isNextDeploy) {
      await retry(expectNoErrors)
    }

    expect(await browser.elementByCss('body').text()).not.toContain(
      'Interception Modal'
    )
    expect(await browser.elementByCss('body').text()).toContain('Locale: en')

    await browser.elementByCss("[href='/en/show']").click()

    // Deploy doesn't have access to runtime logs
    if (!isNextDeploy) {
      await retry(expectNoErrors)
    }

    await check(() => browser.elementByCss('body').text(), /Interception Modal/)
    await check(() => browser.elementByCss('body').text(), /Locale: en/)

    await browser.refresh()
    await check(() => browser.elementByCss('body').text(), /Regular Modal Page/)
    await check(() => browser.elementByCss('body').text(), /Locale: en/)
  })

  it('should handle the not found case correctly without any errors', async () => {
    const browser = await next.browser('/de/show')

    // Deploy doesn't have access to runtime logs
    if (!isNextDeploy) {
      await retry(expectNoErrors)
    }

    expect(await browser.elementByCss('body').text()).toContain(
      'Custom Not Found'
    )
  })
})
