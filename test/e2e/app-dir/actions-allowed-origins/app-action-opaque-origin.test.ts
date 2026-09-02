import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app-dir action allowed from opaque origins', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'opaque-origin'),
    env: {
      NEXT_TEST_ALLOW_OPAQUE_ORIGIN: '1',
    },
  })

  it('should succeed on submission', async function () {
    const browser = await next.browser('/sandboxed')

    await browser.elementByCss('input[type="submit"]').click()

    await retry(async () => {
      expect(await browser.elementByCss('output').text()).toEqual(
        'Action Invoked'
      )
    })
  })
})

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app-dir action disallowed from opaque origins', () => {
  const { isNextDev, next } = nextTestSetup({
    files: join(__dirname, 'opaque-origin'),
    env: {
      NEXT_TEST_ALLOW_OPAQUE_ORIGIN: '',
    },
  })

  it('should fail on submission', async function () {
    const browser = await next.browser('/sandboxed')
    const beforeSubmissionLogOffset = (await browser.log()).length

    await browser.elementByCss('input[type="submit"]').click()

    await retry(async () => {
      const logs = await browser.log()
      const newLogs = logs.slice(beforeSubmissionLogOffset)
      expect(newLogs).toEqual(
        expect.arrayContaining([
          {
            source: 'error',
            message:
              'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
          },
        ])
      )
    })
    if (isNextDev) {
      // page is borked at this point. Nothing interesting to assert on.
    } else {
      expect(await browser.elementByCss('body').text()).toEqual(
        'Internal Server Error'
      )
    }
  })
})
