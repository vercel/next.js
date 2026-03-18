/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import * as Log from './basic/utils/log'
import { waitForRedbox, getRedboxSource } from '../../../lib/next-test-utils'
import { join } from 'path'

describe('after() - invalid usages', () => {
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

    await waitForRedbox(session)
    expect(await getRedboxSource(session)).toMatch(
      /You're importing a module that depends on "?after"? into a React Client Component module\. This API is only available in Server Components but one of its parents is marked with "use client", so this module is also a Client Component\./
    )
    expect(getAfterLogs()).toHaveLength(0)
  })
})
