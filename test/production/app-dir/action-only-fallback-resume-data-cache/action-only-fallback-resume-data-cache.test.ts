import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('action-only fallback resume data cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: isNextDeploy
      ? {}
      : {
          NEXT_PRIVATE_TEST_HEADERS: '1',
          NEXT_PRIVATE_MINIMAL_MODE: '1',
          TEST_CACHE_HANDLER: '1',
        },
  })

  if (isNextDeploy) {
    it('executes an action that is not bundled by the current route', async () => {
      const browser = await next.browser('/events/foo/group')

      await retry(async () => {
        expect(await browser.elementByCss('#action-ready').text()).toBe('ready')
      })

      await browser.elementByCss('#navigate-home').click()
      await retry(async () => {
        expect(await browser.eval('window.location.pathname')).toBe('/')
      })

      await browser.elementByCss('#call-retained-action').click()
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
    async function invokeAction(exportedName: string) {
      const metadata = await next.readJSON(
        '.next/server/app/events/[id]/group.meta'
      )
      const postponed = metadata.postponed as string
      expect(postponed).toEqual(expect.any(String))

      const manifest = await next.readJSON(
        '.next/server/server-reference-manifest.json'
      )
      const actionId = Object.keys(manifest.node).find(
        (id) => manifest.node[id].exportedName === exportedName
      )
      expect(actionId).toEqual(expect.any(String))

      // Simulate the request received by the action worker after the platform
      // has selected the dynamic route's fallback and prepended its postponed
      // state to the action body.
      const actionBody = Buffer.from('[]')
      const postponedBody = Buffer.from(postponed)
      return next.fetch('/events/[id]/group', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'next-action': actionId!,
          'x-matched-path': '/events/[id]/group',
          'x-next-resume-state-length': String(postponedBody.byteLength),
        },
        body: Buffer.concat([postponedBody, actionBody]),
      })
    }

    it('handles postponed state on an action-only fallback request', async () => {
      const response = await invokeAction('readCachedValue')

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/x-component')
      const responseBody = await response.text()
      expect(responseBody).toContain('cached value')
      expect(responseBody).not.toContain('destination page rendered')
    })

    it('applies pending revalidations without rendering the fallback route when the action calls notFound', async () => {
      const outputIndex = next.cliOutput.length

      const response = await invokeAction('notFoundAfterRevalidation')

      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('text/x-component')
      const responseBody = await response.text()
      expect(responseBody).not.toContain('destination page rendered')

      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain('ActionOnlyFallbackCacheHandler::updateTags')
      expect(output).toContain('_N_T_/events/foo/group')
    })
  }
})
