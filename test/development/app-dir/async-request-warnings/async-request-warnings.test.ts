import { nextTestSetup } from 'e2e-utils'

describe('dynamic-requests warnings', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('warnings on sync cookie access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/cookies')

    const browserLogs = await browser.log()
    const browserConsoleErrors = browserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/cookies')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining("`cookies().get('page')`."),
        expect.stringContaining("`cookies().get('component')`."),
        expect.stringContaining("`cookies().has('component')`."),
        expect.stringContaining('`...cookies()` or similar iteration'),
      ],
      terminalCookieErrors: [
        expect.stringContaining("`cookies().get('page')`."),
        expect.stringContaining("`cookies().get('component')`."),
        expect.stringContaining("`cookies().has('component')`."),
        expect.stringContaining('`...cookies()` or similar iteration'),
      ],
    })
  })

  it('warnings on sync draftMode access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/draftMode')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/draftMode')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining('`draftMode().isEnabled`.'),
        expect.stringContaining('`draftMode().isEnabled`.'),
        expect.stringContaining('`draftMode().enable()`.'),
        expect.stringContaining('`draftMode().isEnabled`.'),
      ],
      terminalCookieErrors: [
        expect.stringContaining('`draftMode().isEnabled`.'),
        expect.stringContaining('`draftMode().isEnabled`.'),
        expect.stringContaining('`draftMode().enable()`.'),
        expect.stringContaining('`draftMode().isEnabled`.'),
      ],
    })
  })

  it('warnings on sync headers access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/headers')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/headers')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining("`headers().get('page')`."),
        expect.stringContaining("`headers().get('component')`."),
        expect.stringContaining("`headers().has('component')`."),
        expect.stringContaining('`...headers()` or similar iteration'),
      ],
      terminalCookieErrors: [
        expect.stringContaining("`headers().get('page')`."),
        expect.stringContaining("`headers().get('component')`."),
        expect.stringContaining("`headers().has('component')`."),
        expect.stringContaining('`...headers()` or similar iteration'),
      ],
    })
  })

  it('warnings on sync params access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/params/[slug]')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/params/[slug]')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining('`params.slug`.'),
        expect.stringContaining('`params.slug`.'),
        expect.stringContaining('`params.slug`.'),
        expect.stringContaining('`...params` or similar expression'),
      ],
      terminalCookieErrors: [
        expect.stringContaining('`params.slug`.'),
        expect.stringContaining('`params.slug`.'),
        expect.stringContaining('`params.slug`.'),
        expect.stringContaining('`...params` or similar expression'),
      ],
    })
  })

  it('warnings on sync searchParams access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/request/searchParams')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('Route "/request/searchParams')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining('`searchParams.slug`.'),
        expect.stringContaining('`searchParams.slug`.'),
        expect.stringContaining('`searchParams.slug`.'),
        expect.stringContaining('`Object.keys(searchParams)` or similar'),
      ],
      terminalCookieErrors: [
        expect.stringContaining('`searchParams.slug`.'),
        expect.stringContaining('`searchParams.slug`.'),
        expect.stringContaining('`searchParams.slug`.'),
        expect.stringContaining('`Object.keys(searchParams)` or similar'),
      ],
    })
  })

  describe('no warnings', () => {
    it('should have no warnings on normal rsc page without accessing params', async () => {
      const browser = await next.browser('/no-access/normal')
      const browserLogItems = await browser.log()
      const browserConsoleErrors = browserLogItems
        .filter((log) => log.source === 'error')
        .map((log) => log.message)

      expect(browserConsoleErrors.length).toBe(0)
    })

    it('should only have hydration warnings on hydration mismatch page without accessing params', async () => {
      const browser = await next.browser('/no-access/mismatch')
      const browserLogItems = await browser.log()
      console.log('browserLogItems', browserLogItems)
      const browserConsoleErrors = browserLogItems
        .filter((log) => log.source === 'error')
        .map((log) => log.message)

      // We assert there are zero logged errors but first we assert specific strings b/c we want a better
      // failure message if these do appear
      expect(browserConsoleErrors).toEqual(
        expect.not.arrayContaining([
          expect.stringContaining('param property was accessed directly with'),
          expect.stringContaining(
            'searchParam property was accessed directly with'
          ),
        ])
      )

      // Even though there is a hydration error it does show up in the logs list b/c it is an
      // uncaught Error not a console.error. We expect there to be no logged errors
      expect(browserConsoleErrors.length).toBe(0)
    })
  })
})
