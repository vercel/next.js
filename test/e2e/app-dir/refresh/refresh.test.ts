import { nextTestSetup } from 'e2e-utils'
import { retry, assertHasRedbox, getRedboxDescription } from 'next-test-utils'

describe('app-dir refresh', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    // We do not have access to runtime logs when deployed
    skipDeployment: true,
  })

  if (skipped) return

  it('should refresh client cache when refresh() is called in a server action', async () => {
    const browser = await next.browser('/refresh')

    const initialServerTimestamp = await browser
      .elementById('server-timestamp')
      .text()

    expect(initialServerTimestamp).toBeTruthy()

    await new Promise((resolve) => setTimeout(resolve, 100))

    await browser.elementById('refresh-button').click()

    await retry(async () => {
      const newServerTimestamp = await browser
        .elementById('server-timestamp')
        .text()
      expect(newServerTimestamp).not.toBe(initialServerTimestamp)
      expect(Number(newServerTimestamp)).toBeGreaterThan(
        Number(initialServerTimestamp)
      )
    })
  })

  it('should throw an error when refresh() is called during page render', async () => {
    const browser = await next.browser('/refresh-invalid-render')

    if (isNextDev) {
      await assertHasRedbox(browser)
      const description = await getRedboxDescription(browser)
      expect(description).toContain(
        'refresh can only be called from within a Server Action'
      )
    } else {
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'refresh can only be called from within a Server Action'
        )
      })
    }
  })

  it('should throw an error when refresh() is called in a route handler', async () => {
    const res = await next.fetch('/refresh-invalid-route')
    expect(res.status).toBe(500)

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'refresh can only be called from within a Server Action'
      )
    })
  })

  it('should throw an error when refresh() is called in unstable_cache', async () => {
    const browser = await next.browser('/refresh-invalid-cache')

    if (isNextDev) {
      await assertHasRedbox(browser)
      const description = await getRedboxDescription(browser)
      expect(description).toContain(
        'refresh can only be called from within a Server Action'
      )
    } else {
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'refresh can only be called from within a Server Action'
        )
      })
    }
  })
})
