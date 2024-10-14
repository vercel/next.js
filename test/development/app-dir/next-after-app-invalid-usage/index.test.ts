/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import * as Log from './basic/utils/log'
import {
  assertHasRedbox,
  getRedboxSource,
  retry,
} from '../../../lib/next-test-utils'
import { join } from 'path'

describe('unstable_after() - invalid usages', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'basic'),
  })

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  const getAfterLogs = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return Log.readCliLogs(next.cliOutput.slice(currentCliOutputIndex))
  }

  it('errors at compile time when used in a client module', async () => {
    const session = await next.browser('/invalid-in-client')

    await assertHasRedbox(session)
    expect(await getRedboxSource(session)).toMatch(
      /You're importing a component that needs "?unstable_after"?\. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component\./
    )
    expect(getAfterLogs()).toHaveLength(0)
  })
})

describe('unstable_after() - dynamic APIs', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'dynamic-apis'),
  })

  let currentCliOutputIndex = 0
  beforeEach(() => {
    resetLogs()
  })

  const resetLogs = () => {
    currentCliOutputIndex = next.cliOutput.length
  }

  const getLogs = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  describe('awaited calls', () => {
    it.each([
      {
        api: 'connection',
        path: '/dynamic-apis/connection',
        expectedError: `An error occurred in a function passed to \`unstable_after()\`: Error: Route /dynamic-apis/connection used "connection" inside "unstable_after(...)".`,
      },
      {
        api: 'cookies',
        path: '/dynamic-apis/cookies',
        expectedError: `An error occurred in a function passed to \`unstable_after()\`: Error: Route /dynamic-apis/cookies used "cookies" inside "unstable_after(...)".`,
      },
      {
        api: 'draftMode',
        path: '/dynamic-apis/draft-mode',
        expectedError: `An error occurred in a function passed to \`unstable_after()\`: Error: Route /dynamic-apis/draft-mode used "draftMode" inside "unstable_after(...)".`,
      },
      {
        api: 'headers',
        path: '/dynamic-apis/headers',
        expectedError: `An error occurred in a function passed to \`unstable_after()\`: Error: Route /dynamic-apis/headers used "headers" inside "unstable_after(...)".`,
      },
    ])(
      'does not allow calling $api inside unstable_after',
      async ({ path, expectedError }) => {
        const res = await next.fetch(path)
        await res.text()
        await retry(() => {
          expect(getLogs()).toInclude(expectedError)
        })
      }
    )
  })

  // TODO(after): test unawaited calls, like this
  //
  // export default function Page() {
  //   const promise = headers()
  //   after(async () => {
  //     const headerStore = await promise
  //   })
  //   return null
  // }
})
