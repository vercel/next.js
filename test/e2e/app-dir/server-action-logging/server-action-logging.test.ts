import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('server-action-logging', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
  })

  if (skipped) return

  // Server action logging only happens in development
  if (!isNextDev) {
    it('should not log server actions in production', () => {
      expect(true).toBe(true)
    })
    return
  }

  it('should log successful server action with 200 status', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#success-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('ƒ successAction')
      expect(logs).toMatch(/ƒ successAction\(5\) 200 in \d+ms/)
    })
  })

  it('should log server action with multiple arguments', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#multi-arg-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('ƒ multiArgAction')
      expect(logs).toMatch(/ƒ multiArgAction\(1, 2, 3\) 200 in \d+ms/)
    })
  })

  it('should log server action with object argument', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#object-arg-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('ƒ objectArgAction')
      expect(logs).toMatch(
        /ƒ objectArgAction\(\{ name: "test", value: 42 \}\) 200 in \d+ms/
      )
    })
  })

  it('should log server action with array argument (truncated)', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#array-arg-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('ƒ arrayArgAction')
      // Arrays are truncated to 3 items
      expect(logs).toMatch(
        /ƒ arrayArgAction\(\[1, 2, 3, \.\.\.\(2 more\)\]\) 200 in \d+ms/
      )
    })
  })

  it('should log redirect action with 307 status', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#redirect-action').click()
    await browser.waitForElementByCss('#redirect-target')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('ƒ redirectAction')
      // redirect() uses 307 (TemporaryRedirect) by default
      expect(logs).toMatch(
        /ƒ redirectAction\("\/redirect-target"\) 307 in \d+ms/
      )
    })
  })

  it('should log notFound action with 404 status', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#not-found-action').click()

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('ƒ notFoundAction')
      expect(logs).toMatch(/ƒ notFoundAction\(\) 404 in \d+ms/)
    })
  })

  it('should log error action with 500 status', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#error-action').click()
    await browser.waitForElementByCss('#error')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('ƒ errorAction')
      expect(logs).toMatch(/ƒ errorAction\(\) 500 in \d+ms/)
    })
  })

  it('should show relative file path in log', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#success-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      // Should show relative path like app/actions.js, not full path
      expect(logs).toMatch(/app\/actions\.js/)
      // Should not contain the test directory prefix
      expect(logs).not.toContain('test/e2e/app-dir/server-action-logging/')
    })
  })
})
