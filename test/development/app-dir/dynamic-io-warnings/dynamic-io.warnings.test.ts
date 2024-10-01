import { nextTestSetup } from 'e2e-utils'

describe('dynamic-requests warnings', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('warnings on sync cookie access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/pages/cookies')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('In route /pages/cookies')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().get('page')`."
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().get('component')`."
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/cookies cookies were iterated implicitly'
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().get('component')`."
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/cookies cookies were iterated implicitly'
        ),
      ],
      terminalCookieErrors: [
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().get('page')`."
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().get('component')`."
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/cookies cookies were iterated implicitly'
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().get('component')`."
        ),
        expect.stringContaining(
          "In route /pages/cookies a cookie property was accessed directly with `cookies().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/cookies cookies were iterated implicitly'
        ),
      ],
    })
  })

  it('warnings on sync draftMode access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/pages/draftMode')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('In route /pages/draftMode')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().enable()`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().enable()`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
      ],
      terminalCookieErrors: [
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().enable()`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().enable()`.'
        ),
        expect.stringContaining(
          'In route /pages/draftMode a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
      ],
    })
  })

  it('warnings on sync headers access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/pages/headers')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('In route /pages/headers')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().get('page')`."
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().get('component')`."
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/headers headers were iterated implicitly'
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().get('component')`"
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/headers headers were iterated implicitly'
        ),
      ],
      terminalCookieErrors: [
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().get('page')`."
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().get('component')`."
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/headers headers were iterated implicitly'
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().get('component')`"
        ),
        expect.stringContaining(
          "In route /pages/headers a header property was accessed directly with `headers().has('component')`."
        ),
        expect.stringContaining(
          'In route /pages/headers headers were iterated implicitly'
        ),
      ],
    })
  })

  it('warnings on sync params access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/pages/params/[slug]')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('In route /pages/params/[slug]')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] params are being enumerated'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] params are being enumerated'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
      ],
      terminalCookieErrors: [
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] params are being enumerated'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] params are being enumerated'
        ),
        expect.stringContaining(
          'In route /pages/params/[slug] a param property was accessed directly with `params.slug`.'
        ),
      ],
    })
  })

  it('warnings on sync searchParams access', async () => {
    const nextDevBootstrapOutputIndex = next.cliOutput.length

    const browser = await next.browser('/pages/searchParams')

    const browserLogsserLogs = await browser.log()
    const browserConsoleErrors = browserLogsserLogs
      .filter((log) => log.source === 'error')
      .map((log) => log.message)
    const terminalOutput = next.cliOutput.slice(nextDevBootstrapOutputIndex)
    const terminalCookieErrors = terminalOutput.split('\n').filter((line) => {
      return line.includes('In route /pages/searchParams')
    })
    expect({ browserConsoleErrors, terminalCookieErrors }).toEqual({
      browserConsoleErrors: [
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams searchParams are being enumerated'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams searchParams are being enumerated'
        ),
      ],
      terminalCookieErrors: [
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams searchParams are being enumerated'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams a searchParam property was accessed directly with `searchParams.slug`.'
        ),
        expect.stringContaining(
          'In route /pages/searchParams searchParams are being enumerated'
        ),
      ],
    })
  })
})
