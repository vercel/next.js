import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe('app-dir action case-insensitive origin and allowed origins (config) comparison', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, 'config-match-case-insensitive'),
    skipDeployment: true,
    dependencies: {
      'server-only': 'latest',
    },
  })

  if (skipped) return

  it('should allow server action when origin matches allowed origins (config) case-insensitively', async () => {
    const browser = await next.browser('/')
    let actionRequestStatus: number | undefined

    browser.on('response', async (res) => {
      const request = res.request()
      if (request.method() !== 'POST') return

      const headers = await request.allHeaders()
      if (!headers['next-action']) return

      actionRequestStatus = res.status()
    })

    await browser.elementById('submit-button').click()

    await retry(async () => {
      expect(actionRequestStatus).toBe(200)
      expect(await browser.elementById('result-status').text()).toBe('Success')
      expect(await browser.elementById('result-message').text()).toBe(
        'Testing allowedOrigins case-insensitive validation'
      )
    })
  })
})
