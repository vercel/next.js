/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import escapeStringRegexp from 'escape-string-regexp'
import { retry } from 'next-test-utils'

describe('after - error stacks', () => {
  const { next, skipped, isNextStart } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  if (!process.env.TURBOPACK) {
    // https://linear.app/vercel/issue/NDX-531/component-name-mapping-off-by-one-in-terminal
    it.todo('source maps in webpack give incorrect function names')
    return
  }

  if (isNextStart) {
    // TODO: make these tests work in `next start` somehow
    it.todo('stack traces are not sourcemapped in prod')
    return
  }

  let currentCliOutputIndex = 0

  const ignorePreviousLogs = () => {
    currentCliOutputIndex = next.cliOutput.length
  }

  const getLogs = () => {
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  beforeEach(() => {
    ignorePreviousLogs()
  })

  const waitForLoggedError = () => {
    return retry(() => {
      const logs = getLogs()
      expect(logs).toMatch(errorLogPattern)
      return extractLoggedAfterError(logs)
    })
  }

  it.todo('middleware')
  it.todo('route handlers')
  it.todo('server actions')

  it('nested', async () => {
    await next.render('/nested')
    const loggedError = await waitForLoggedError()

    expect(loggedError).toMatchInlineSnapshot(`
      "An error occurred in a function passed to \`after()\`: Error: kaboom
          at throws (_.js:0:0)
          at aboveThrows (_.js:0:0)
          at <async execution of after callback> (_.js:0:0)
          at nestedHelper (_.js:0:0)
          at aboveNestedHelper (_.js:0:0)
          at <async execution of after callback> (_.js:0:0)
          at helper (_.js:0:0)
          at Inner (_.js:0:0)
          at Wrapper (_.js:0:0)
          at Page (_.js:0:0)
      "
    `)
  })

  it('simple-callback', async () => {
    await next.render('/simple-callback')
    const loggedError = await waitForLoggedError()

    expect(loggedError).toMatchInlineSnapshot(`
      "An error occurred in a function passed to \`after()\`: Error: kaboom
          at throws (_.js:0:0)
          at <unknown> (_.js:0:0)
          at <async execution of after callback> (_.js:0:0)
          at helper (_.js:0:0)
          at Inner (_.js:0:0)
          at Wrapper (_.js:0:0)
          at Page (_.js:0:0)
      "
    `)
  })

  it('callback-timeout', async () => {
    await next.render('/callback-timeout')
    const loggedError = await waitForLoggedError()

    // the `<unknown>` callback is omitted because of async stack traces
    expect(loggedError).toMatchInlineSnapshot(`
      "An error occurred in a function passed to \`after()\`: Error: kaboom
          at throws (_.js:0:0)
          at bar (_.js:0:0)
          at <async execution of after callback> (_.js:0:0)
          at foo (_.js:0:0)
          at Inner (_.js:0:0)
          at Wrapper (_.js:0:0)
          at Page (_.js:0:0)
      "
    `)
  })

  it('callback-timeout-2', async () => {
    await next.render('/callback-timeout-2')
    const loggedError = await waitForLoggedError()

    expect(loggedError).toMatchInlineSnapshot(`
      "An error occurred in a function passed to \`after()\`: Error: kaboom
          at throws (_.js:0:0)
          at bar (_.js:0:0)
          at <unknown> (_.js:0:0)
          at <async execution of after callback> (_.js:0:0)
          at foo (_.js:0:0)
          at async Inner (_.js:0:0)
          at Wrapper (_.js:0:0)
          at Page (_.js:0:0)
      "
    `)
  })

  describe('promises', () => {
    it('simple-promise', async () => {
      await next.render('/simple-promise')
      const loggedError = await waitForLoggedError()

      expect(loggedError).toMatchInlineSnapshot(`
        "A promise passed to \`after()\` rejected: Error: kaboom
            at throws (_.js:0:0)
            at throwsAsync (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at helper (_.js:0:0)
            at Inner (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })

    it('nested-promise', async () => {
      await next.render('/nested-promise')
      const loggedError = await waitForLoggedError()

      // TODO(after): is it acceptable that `Inner` is missing here?
      expect(loggedError).toMatchInlineSnapshot(`
        "A promise passed to \`after()\` rejected: Error: kaboom
            at throws (_.js:0:0)
            at <unknown> (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at nestedHelper (_.js:0:0)
            at <unknown> (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })

    it('nested-promise-2', async () => {
      await next.render('/nested-promise-2')
      const loggedError = await waitForLoggedError()

      // TODO(after): is it acceptable that `Inner` is missing here?
      expect(loggedError).toMatchInlineSnapshot(`
        "A promise passed to \`after()\` rejected: Error: kaboom
            at throws (_.js:0:0)
            at zap (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at bar (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })
  })

  describe('mixing callbacks and promises', () => {
    it('nested-promise-above-callback-1', async () => {
      await next.render('/nested-promise-above-callback-1')
      const loggedError = await waitForLoggedError()

      // TODO(after): is it acceptable that `Inner` is missing here?
      expect(loggedError).toMatchInlineSnapshot(`
        "An error occurred in a function passed to \`after()\`: Error: kaboom
            at throws (_.js:0:0)
            at zap (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at bar (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })

    it('nested-promise-above-callback-2', async () => {
      await next.render('/nested-promise-above-callback-2')
      const loggedError = await waitForLoggedError()

      // the `aboveZap` callback is omitted because of async stack traces
      expect(loggedError).toMatchInlineSnapshot(`
        "An error occurred in a function passed to \`after()\`: Error: kaboom
            at throws (_.js:0:0)
            at zap (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at bar (_.js:0:0)
            at foo (_.js:0:0)
            at async Inner (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })

    it('nested-promise-above-callback-2-sync', async () => {
      await next.render('/nested-promise-above-callback-2-sync')
      const loggedError = await waitForLoggedError()

      // the `aboveZap` callback is omitted because of async stack traces
      expect(loggedError).toMatchInlineSnapshot(`
        "An error occurred in a function passed to \`after()\`: Error: kaboom
            at throws (_.js:0:0)
            at zap (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at bar (_.js:0:0)
            at foo (_.js:0:0)
            at Inner (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })

    it('nested-promise-above-callback-3', async () => {
      await next.render('/nested-promise-above-callback-3')
      const loggedError = await waitForLoggedError()

      expect(loggedError).toMatchInlineSnapshot(`
        "An error occurred in a function passed to \`after()\`: Error: kaboom
            at throws (_.js:0:0)
            at zap (_.js:0:0)
            at aboveZap (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at bar (_.js:0:0)
            at foo (_.js:0:0)
            at async Inner (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })

    it('nested-promise-above-callback-4', async () => {
      await next.render('/nested-promise-above-callback-4')
      const loggedError = await waitForLoggedError()

      expect(loggedError).toMatchInlineSnapshot(`
        "An error occurred in a function passed to \`after()\`: Error: kaboom
            at throws (_.js:0:0)
            at zap (_.js:0:0)
            at aboveZap (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at bar (_.js:0:0)
            at foo (_.js:0:0)
            at Inner (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })

    it('nested-promise-above-callback-4-sync', async () => {
      await next.render('/nested-promise-above-callback-4-sync')
      const loggedError = await waitForLoggedError()

      expect(loggedError).toMatchInlineSnapshot(`
        "An error occurred in a function passed to \`after()\`: Error: kaboom
            at throws (_.js:0:0)
            at zap (_.js:0:0)
            at aboveZap (_.js:0:0)
            at <async execution of after callback> (_.js:0:0)
            at bar (_.js:0:0)
            at foo (_.js:0:0)
            at Inner (_.js:0:0)
            at Wrapper (_.js:0:0)
            at Page (_.js:0:0)
        "
      `)
    })
  })
})

function extractLoggedAfterError(logs: string) {
  const match = logs.match(errorLogPattern)
  if (!match) {
    throw new Error('Could not find log error pattern')
  }
  const text = match[0]
  return stripLocations(text)
}

const group = (regexStr: string) => `(?:${regexStr})`

const errorLogPrefixPattern = new RegExp(
  group(
    group(escapeStringRegexp('A promise passed to `after()` rejected: ')) +
      '|' +
      group(
        escapeStringRegexp(
          'An error occurred in a function passed to `after()`: '
        )
      )
  )
)

const errorLogPattern = new RegExp(
  errorLogPrefixPattern.source +
    /[^\n]+\n/.source +
    /(?:\s+at .*? \(.*?(?::\d+:\d+)?\)\n)+/.source
)

/** Replace "(/some/file:123:456)" with "(/some/file/0:0)" */
function stripLocations(errorStack: string) {
  return errorStack.replaceAll(
    /(\s+at .*?) \((.*?)(?::\d+:\d+)?\)\n/g,
    '$1 (_.js:0:0)\n'
  )
}
