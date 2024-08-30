/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import * as Log from './utils/log'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from '../../../lib/next-test-utils'

describe('unstable_after() - invalid usages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  const getLogs = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return Log.readCliLogs(next.cliOutput.slice(currentCliOutputIndex))
  }

  it.each(['error', 'force-static'])(
    `errors at compile time with dynamic = "%s"`,
    async (dynamicValue) => {
      const pathname = '/invalid-in-dynamic-' + dynamicValue
      const session = await next.browser(pathname)

      await assertHasRedbox(session)
      expect(await getRedboxDescription(session)).toContain(
        `Route ${pathname} with \`dynamic = "${dynamicValue}"\` couldn't be rendered statically because it used \`unstable_after\``
      )
      expect(getLogs()).toHaveLength(0)
    }
  )
  it('errors at compile time when used in a client module', async () => {
    const session = await next.browser('/invalid-in-client')

    await assertHasRedbox(session)
    expect(await getRedboxSource(session)).toMatch(
      /You're importing a component that needs "?unstable_after"?\. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component\./
    )
    expect(getLogs()).toHaveLength(0)
  })
})
