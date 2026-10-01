/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('setting cookies', () => {
  const { next, isNextDeploy, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) return

  let currentCliOutputIndex = 0
  beforeEach(() => {
    resetCliOutput()
  })

  const getCliOutput = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  const resetCliOutput = () => {
    currentCliOutputIndex = next.cliOutput.length
  }

  const EXPECTED_ERROR =
    /Cookies can only be modified in a Server Action or Route Handler\./

  describe('stops cookie mutations when changing phases', () => {
    it('from an action to a page render', async () => {
      const path = '/cookies/action-to-render'
      const session = await next.browser(path)

      const timestamp1 = await session.elementById('timestamp').text()
      // .set() should throw during render
      expect(await session.elementById('canSetCookies').text()).toEqual('false')
      if (!isNextDeploy) {
        expect(getCliOutput()).toMatch(EXPECTED_ERROR)
      }
      // no cookie should be set
      expect(await session.eval('document.cookie')).not.toInclude(
        'illegalCookie'
      )

      resetCliOutput()
      // trigger an action
      await session.elementByCss('[type="submit"]').click()
      // wait for page to update as a result
      await retry(async () => {
        const timestamp2 = await session.elementById('timestamp').text()
        expect(timestamp2).not.toEqual(timestamp1)
      })

      // .set() should throw during render
      expect(await session.elementById('canSetCookies').text()).toEqual('false')
      if (!isNextDeploy) {
        expect(getCliOutput()).toMatch(EXPECTED_ERROR)
      }

      // no cookie should be set
      expect(await session.eval('document.cookie')).not.toInclude(
        'illegalCookie'
      )
    })
  })
})

// All three phases produce the same diagnostic. Separate instances prevent a
// delayed log from another phase from satisfying the current assertion.
describe.each([
  {
    phase: 'action',
    path: '/cookies/action-to-after/via-closure',
  },
  {
    phase: 'route handler',
    path: '/cookies/route-handler-to-after/via-closure',
  },
  {
    phase: 'middleware',
    path: '/cookies/middleware-to-after/via-closure',
  },
])('setting cookies - from $phase to after via closure', ({ phase, path }) => {
  const { next } = nextTestSetup({
    files: __dirname,
    captureRuntimeLogs: true,
  })

  it('stops cookie mutations in after()', async () => {
    if (phase === 'action') {
      const browser = await next.browser(path)
      await browser.elementByCss('[type="submit"]').click()
      await expectAfterError()
      expect(await browser.eval('document.cookie')).not.toInclude(
        'illegalCookie'
      )
    } else {
      const response = await next.fetch(path, {
        method: phase === 'route handler' ? 'POST' : 'GET',
      })
      await response.text()
      expect(response.status).toBe(200)
      expect(response.headers.get('set-cookie')).toBe(null)
      await expectAfterError()
    }
  })

  async function expectAfterError() {
    await retry(() => {
      expect(next.cliOutput).toMatch(
        /An error occurred in a function passed to `after\(\)`: .+?: Cookies can only be modified in a Server Action or Route Handler\./
      )
    }, 30_000)
  }
})
