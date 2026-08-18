import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe('app-dir action allowed from opaque origins', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, 'opaque-origin'),
    skipDeployment: true,
    env: {
      NEXT_TEST_ALLOW_OPAQUE_ORIGIN: '1',
    },
  })

  if (skipped) {
    return
  }

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

describe('app-dir action disallowed from opaque origins', () => {
  const { isNextDev, next, skipped } = nextTestSetup({
    files: join(__dirname, 'opaque-origin'),
    skipDeployment: true,
    env: {
      NEXT_TEST_ALLOW_OPAQUE_ORIGIN: '',
    },
  })

  if (skipped) {
    return
  }

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
