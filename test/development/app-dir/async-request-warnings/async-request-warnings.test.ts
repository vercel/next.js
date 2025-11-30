import { nextTestSetup } from 'e2e-utils'

describe('dynamic-requests warnings', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('warnings on sync cookie access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/cookies')

    const browserLogs = await browser.log()
    const browserConsoleWarnings = browserLogs
      .filter((log) => log.source === 'warning')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/cookies')
    })
    expect({ browserConsoleWarnings, terminalCookieErrors }).toEqual({
      browserConsoleWarnings: [expect.stringContaining('`cookies().get`.')],
      terminalCookieErrors: [expect.stringContaining('`cookies().get`.')],
    })
  })

  it('warnings on sync draftMode access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/draftMode')

    const browserLogs = await browser.log()
    const browserConsoleWarnings = browserLogs
      .filter((log) => log.source === 'warning')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/draftMode')
    })
    expect({ browserConsoleWarnings, terminalCookieErrors }).toEqual({
      browserConsoleWarnings: [
        expect.stringContaining('`draftMode().isEnabled`.'),
      ],
      terminalCookieErrors: [
        expect.stringContaining('`draftMode().isEnabled`.'),
      ],
    })
  })

  it('warnings on sync headers access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/headers')

    const browserLogs = await browser.log()
    const browserConsoleWarnings = browserLogs
      .filter((log) => log.source === 'warning')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/headers')
    })
    expect({ browserConsoleWarnings, terminalCookieErrors }).toEqual({
      browserConsoleWarnings: [expect.stringContaining('`headers().get`.')],
      terminalCookieErrors: [expect.stringContaining('`headers().get`.')],
    })
  })

  it('warnings on sync params access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/params/[slug]')

    const browserLogs = await browser.log()
    const browserConsoleWarnings = browserLogs
      .filter((log) => log.source === 'warning')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/params/[slug]')
    })
    expect({ browserConsoleWarnings, terminalCookieErrors }).toEqual({
      browserConsoleWarnings: [expect.stringContaining('`params.slug`.')],
      terminalCookieErrors: [expect.stringContaining('`params.slug`.')],
    })
  })

  it('warnings on sync searchParams access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/searchParams')

    const browserLogs = await browser.log()
    const browserConsoleWarnings = browserLogs
      .filter((log) => log.source === 'warning')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/searchParams')
    })
    expect({ browserConsoleWarnings, terminalCookieErrors }).toEqual({
      browserConsoleWarnings: [expect.stringContaining('`searchParams.slug`.')],
      terminalCookieErrors: [expect.stringContaining('`searchParams.slug`.')],
    })
  })

  describe('no warnings', () => {
    it('should have no warnings on normal rsc page without accessing params', async () => {
      const browser = await next.browser('/no-access/normal')
      const browserLogItems = await browser.log()
      const browserConsoleWarnings = browserLogItems
        .filter((log) => log.source === 'warning')
        .map((log) => log.message)

      expect(browserConsoleWarnings.length).toBe(0)
    })

    it('should only have hydration warnings on hydration mismatch page without accessing params', async () => {
      const browser = await next.browser('/no-access/mismatch')
      const browserLogItems = await browser.log()
      console.log('browserLogItems', browserLogItems)
      const browserConsoleWarnings = browserLogItems
        .filter((log) => log.source === 'warning')
        .map((log) => log.message)

      // We assert there are zero logged errors but first we assert specific strings b/c we want a better
      // failure message if these do appear
      expect(browserConsoleWarnings).toEqual(
        expect.not.arrayContaining([
          expect.stringContaining('param property was accessed directly with'),
          expect.stringContaining(
            'searchParam property was accessed directly with'
          ),
        ])
      )

      // Even though there is a hydration error it does show up in the logs list b/c it is an
      // uncaught Error not a console.error. We expect there to be no logged errors
      expect(browserConsoleWarnings.length).toBe(0)
    })
  })
})
