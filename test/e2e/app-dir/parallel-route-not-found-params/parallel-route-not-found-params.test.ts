import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-route-not-found', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should behave correctly without any errors', async () => {
    const browser = await next.browser('/en')

    // Deploy doesn't have access to runtime logs
    if (!isNextDeploy) {
      await retry(
        () => {
          if (
            next.cliOutput.includes('TypeError') ||
            next.cliOutput.includes('Warning')
          ) {
            return 'has-errors'
          }
        },
        30000,
        1000
      )
    }

    expect(await browser.elementByCss('body').text()).not.toContain(
      'Interception Modal'
    )
    expect(await browser.elementByCss('body').text()).toContain('Locale: en')

    await browser.elementByCss("[href='/en/show']").click()

    // Deploy doesn't have access to runtime logs
    if (!isNextDeploy) {
      await retry(
        () => {
          if (
            next.cliOutput.includes('TypeError') ||
            next.cliOutput.includes('Warning')
          ) {
            return 'has-errors'
          }
        },
        30000,
        1000
      )
    }

    await retry(
      async () => {
        expect(await browser.elementByCss('body').text()).toMatch(
          /Interception Modal/
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementByCss('body').text()).toMatch(/Locale: en/)
      },
      30000,
      1000
    )

    await browser.refresh()
    await retry(
      async () => {
        expect(await browser.elementByCss('body').text()).toMatch(
          /Regular Modal Page/
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementByCss('body').text()).toMatch(/Locale: en/)
      },
      30000,
      1000
    )
  })

  it('should handle the not found case correctly without any errors', async () => {
    const browser = await next.browser('/de/show')

    // Deploy doesn't have access to runtime logs
    if (!isNextDeploy) {
      await retry(
        () => {
          if (
            next.cliOutput.includes('TypeError') ||
            next.cliOutput.includes('Warning')
          ) {
            return 'has-errors'
          }
        },
        30000,
        1000
      )
    }

    expect(await browser.elementByCss('body').text()).toContain(
      'Custom Not Found'
    )
  })
})
