/* eslint-disable jest/no-standalone-expect */
import { retry } from 'next-test-utils'
import { nextTestSetup, isNextDeploy } from 'e2e-utils'
import type { Playwright } from 'e2e-utils'

async function runForwardedAction(browser: Playwright) {
  await retry(async () => {
    expect(await browser.elementById('editor').text()).toBe('ready')
  })
  await browser.elementById('back').click()
  await browser.waitForElementByCss('#call-action')
  await browser.elementById('call-action').click()
  await retry(async () => {
    expect(await browser.elementById('call-action').text()).toBe('saved')
  })
}

describe('action-forward-encode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // In deploy mode this is ignored and the suite runs against the real
    // deployment. Locally, server.js wraps Next.js in a strict front end that
    // rejects literal brackets, which is what triggers the bug.
    startCommand: 'node server.js',
    serverReadyPattern: /- Local: http:\/\/localhost:\d+/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  it('runs an action forwarded from a page that does not bundle it', async () => {
    // Kept active in deploy mode: the forwarded request crosses the real
    // deployment ingress instead of the local strict server below.
    const browser = await next.browser('/items/1/edit')
    await runForwardedAction(browser)
  })

  // The strict ingress simulation needs a custom local server, which deploy
  // mode cannot provide. The assertion above stays active in deploy mode to
  // cover the real ingress.
  if (!isNextDeploy) {
    it('encodes the forwarded worker route pattern', async () => {
      await next.fetch('/__seen-posts', { method: 'DELETE' })

      const browser = await next.browser('/items/1/edit')
      await runForwardedAction(browser)

      const res = await next.fetch('/__seen-posts')
      const seenPaths: string[] = await res.json()

      expect(seenPaths).toContain('/items/%5Bid%5D/edit')
      expect(seenPaths.filter((url) => /[[\]]/.test(url))).toEqual([])
    })
  }
})
