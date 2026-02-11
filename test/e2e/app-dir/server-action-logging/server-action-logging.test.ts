import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('server-action-logging', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
  })

  if (skipped) return

  if (isNextStart) {
    it('should not log server actions in production mode', async () => {
      const browser = await next.browser('/')
      const outputIndex = next.cliOutput.length

      await browser.elementByCss('#success-action').click()
      await browser.waitForElementByCss('#result')

      // Wait a bit and verify no action logs appear
      await retry(() => {
        const logs = stripAnsi(next.cliOutput.slice(outputIndex))
        // Should not contain the server action log format
        expect(logs).not.toContain('└─ ƒ successAction')
      })
    })
    return
  }

  it('should log successful server action', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#success-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('└─ ƒ successAction')
      expect(logs).toMatch(/└─ ƒ successAction\(5\) in \d+ms/)

      // Validate order: POST request and server action log should be on consecutive lines
      const lines = logs.split('\n')
      const postLineIndex = lines.findIndex((line) => line.includes('POST /'))
      const actionLineIndex = lines.findIndex((line) =>
        line.includes('└─ ƒ successAction')
      )
      expect(postLineIndex).toBeGreaterThan(-1)
      expect(actionLineIndex).toBe(postLineIndex + 1)
    })
  })

  it('should log server action with multiple arguments', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#multi-arg-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('└─ ƒ multiArgAction')
      expect(logs).toMatch(/└─ ƒ multiArgAction\(1, 2, 3\) in \d+ms/)
    })
  })

  it('should log server action with object argument', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#object-arg-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('└─ ƒ objectArgAction')
      // safe-stable-stringify outputs JSON format
      expect(logs).toMatch(
        /└─ ƒ objectArgAction\(\{"name":"test","value":42\}\) in \d+ms/
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
      expect(logs).toContain('└─ ƒ arrayArgAction')
      // Arrays are truncated by safe-stable-stringify
      expect(logs).toMatch(/└─ ƒ arrayArgAction\(\[1,2,3,.*\]\) in \d+ms/)
    })
  })

  it('should log redirect action', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#redirect-action').click()
    await browser.waitForElementByCss('#redirect-target')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('└─ ƒ redirectAction')
      expect(logs).toMatch(
        /└─ ƒ redirectAction\("\/redirect-target"\) in \d+ms/
      )
    })
  })

  it('should log notFound action', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#not-found-action').click()

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('└─ ƒ notFoundAction')
      expect(logs).toMatch(/└─ ƒ notFoundAction\(\) in \d+ms/)
    })
  })

  it('should log error action', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#error-action').click()
    await browser.waitForElementByCss('#error')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('└─ ƒ errorAction')
      expect(logs).toMatch(/└─ ƒ errorAction\(\) in \d+ms/)
    })
  })

  it('should log server action with promise argument', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#promise-arg-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(logs).toContain('└─ ƒ promiseArgAction')
      expect(logs).toMatch(/└─ ƒ promiseArgAction\(.*\) in \d+ms/)
    })
  })

  it('should log inline action', async () => {
    const browser = await next.browser('/inline')
    await browser.waitForElementByCss('#inline-page')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#true-inline-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      // Inline actions show as <inline action> with file location
      expect(logs).toMatch(
        /└─ ƒ <inline action>\(10\) in \d+ms app\/inline\/page\.js/
      )
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

describe('server-action-logging when logging.serverFunctions is disabled', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
    env: {
      NEXT_TEST_SERVER_FUNCTION_LOGGING: 'false',
    },
  })

  if (skipped) return

  it('should not log server actions', async () => {
    const browser = await next.browser('/')
    const outputIndex = next.cliOutput.length

    await browser.elementByCss('#success-action').click()
    await browser.waitForElementByCss('#result')

    await retry(() => {
      const logs = stripAnsi(next.cliOutput.slice(outputIndex))
      if (isNextDev) {
        expect(logs).toContain('POST /')
      }
      expect(logs).not.toContain('└─ ƒ successAction')
    })
  })
})
