import { nextTestSetup } from 'e2e-utils'
import { check, gate, retry } from 'next-test-utils'

describe('parallel-route-not-found', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  async function expectNoErrors() {
    // FIXME: Remove the DEP0144 allowance once require-cache stops using module.parent.
    let output = next.cliOutput.replace(
      /^\(node:\d+\) \[DEP0144\] DeprecationWarning: module\.parent[^\r\n]*(?:\r?\n[ \t]+at [^\r\n]*)*\r?\n?/gm,
      ''
    )
    if (
      await gate(
        (conditions) =>
          conditions.futureCompat && conditions.dev && !conditions.turbopack
      )
    ) {
      output = output.replaceAll(
        'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.',
        ''
      )
    }
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
      await retry(async () => {
        if (
          await gate(
            (conditions) =>
              conditions.futureCompat && conditions.dev && conditions.rspack
          )
        ) {
          expect(next.cliOutput).toContain(
            'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.' +
              '\n    at new Promise (<anonymous>) {' +
              "\n  code: 'DEP0144'" +
              '\n}'
          )
        } else if (
          await gate(
            (conditions) =>
              conditions.futureCompat && conditions.dev && conditions.webpack
          )
        ) {
          expect(next.cliOutput).toContain(
            'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.' +
              '\n    at ignore-listed frames {' +
              "\n  code: 'DEP0144'" +
              '\n}'
          )
        } else if (
          isNextDev &&
          (await gate((conditions) => !conditions.turbopack))
        ) {
          expect(next.cliOutput).toContain(
            '[DEP0144] DeprecationWarning: module.parent'
          )
        }
        await expectNoErrors()
      })
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
