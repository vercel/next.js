import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('forwarded action resume data cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: isNextDeploy
      ? {}
      : {
          NEXT_PRIVATE_TEST_HEADERS: '1',
          NEXT_PRIVATE_MINIMAL_MODE: '1',
        },
  })

  if (isNextDeploy) {
    it('executes a forwarded action through the deployment proxy', async () => {
      const browser = await next.browser('/events/foo/group')

      await retry(async () => {
        expect(await browser.elementByCss('#action-ready').text()).toBe('ready')
      })

      await browser.elementByCss('#navigate-home').click()
      await retry(async () => {
        expect(await browser.eval('window.location.pathname')).toBe('/')
      })

      await browser.elementByCss('#call-forwarded-action').click()
      await retry(async () => {
        expect(await browser.elementByCss('#action-result').text()).toBe(
          'cached value'
        )
      })

      expect(await browser.elementByCss('body').text()).not.toContain(
        'destination page rendered'
      )
    })
  } else {
    it('handles postponed state on the forwarded action worker', async () => {
      const metadata = await next.readJSON(
        '.next/server/app/events/[id]/group.meta'
      )
      const postponed = metadata.postponed as string
      expect(postponed).toEqual(expect.any(String))

      const manifest = await next.readJSON(
        '.next/server/server-reference-manifest.json'
      )
      const actionId = Object.keys(manifest.node).find(
        (id) => manifest.node[id].exportedName === 'readCachedValue'
      )
      expect(actionId).toEqual(expect.any(String))

      // Simulate the request received by the action worker after the platform
      // has selected the dynamic route's fallback and prepended its postponed
      // state to the action body.
      const actionBody = Buffer.from('[]')
      const postponedBody = Buffer.from(postponed)
      const response = await next.fetch('/events/[id]/group', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'next-action': actionId!,
          'x-matched-path': '/events/[id]/group',
          'x-next-resume-state-length': String(postponedBody.byteLength),
        },
        body: Buffer.concat([postponedBody, actionBody]),
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/x-component')
      const responseBody = await response.text()
      expect(responseBody).toContain('cached value')
      expect(responseBody).not.toContain('destination page rendered')
    })
  }
})
