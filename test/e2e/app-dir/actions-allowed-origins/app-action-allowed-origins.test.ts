import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

describe('app-dir action allowed origins', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, 'safe-origins'),
    skipDeployment: true,
    dependencies: {
      'server-only': 'latest',
    },
    // An arbitrary & random port.
    forcedPort: 'random',
  })

  if (skipped) {
    return
  }

  it('should pass if localhost is set as a safe origin', async function () {
    const browser = await next.browser('/')

    await browser.elementByCss('button').click()

    await check(async () => {
      return await browser.elementByCss('#res').text()
    }, 'hi')
  })

  it('should not crash for requests from privacy sensitive contexts', async function () {
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        Origin: 'null',
        'Content-type': 'application/x-www-form-urlencoded',
        'Sec-Fetch-Site': 'same-origin',
      },
    })

    expect({ status: res.status }).toEqual({ status: 200 })
  })
})
