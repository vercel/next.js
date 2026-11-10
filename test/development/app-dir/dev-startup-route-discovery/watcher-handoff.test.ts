import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

const RELEASE_FILE = '.release-watcher'

// Holds back the dev server's file watcher (test-only hook) so the first
// requests are deterministically served from the startup snapshot of the route
// directories, and changes made before the watcher catches up are reconciled
// once it does.
describe('dev-startup-route-discovery watcher handoff', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      __NEXT_TEST_DEV_WATCHER_HOLD_UNTIL: RELEASE_FILE,
    },
  })

  it('serves from the snapshot and reconciles changes once the watcher catches up', async () => {
    // Served before the watcher processed anything.
    const first = await next.fetch('/')
    expect(first.status).toBe(200)
    expect(first.headers.get('x-proxy')).toBe('yes')
    expect(await first.text()).toContain('hello world')

    const manifest = await next.fetch(
      '/_next/static/development/_devPagesManifest.json'
    )
    expect((await manifest.json()).pages).toEqual(
      expect.arrayContaining(['/legacy', '/handoff-removed', '/api/ping'])
    )

    expect((await next.fetch('/handoff-removed')).status).toBe(200)
    expect(await (await next.fetch('/api/env')).json()).toEqual({
      value: 'initial',
    })

    // The snapshot's interception route is applied to client navigations.
    const interceptingBrowser = await next.browser('/feed')
    await interceptingBrowser.elementByCss('#photo-link').click()
    await retry(async () => {
      expect(
        await interceptingBrowser.elementByCss('#intercepted-photo').text()
      ).toBe('intercepted photo')
    })
    await interceptingBrowser.close()

    // Change route inputs while the watcher is held.
    await next.patchFile(
      'app/handoff-added/page.tsx',
      'export default function Page() { return <p>handoff added page</p> }'
    )
    await next.deleteFile('pages/handoff-removed.tsx')
    await next.deleteFile('app/@modal/(.)photo/[id]/page.tsx')
    await next.patchFile('.env', 'HANDOFF_VALUE=changed\n')

    // The watcher hasn't processed the new page yet.
    expect((await next.fetch('/handoff-added')).status).toBe(404)

    fs.writeFileSync(path.join(next.testDir, RELEASE_FILE), '')

    await retry(async () => {
      const res = await next.fetch('/handoff-added')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('handoff added page')
    })
    await retry(async () => {
      expect((await next.fetch('/handoff-removed')).status).toBe(404)
    })
    await retry(async () => {
      expect(await (await next.fetch('/api/env')).json()).toEqual({
        value: 'changed',
      })
    })

    // The removed interception route no longer rewrites client navigations.
    const browser = await next.browser('/feed')
    await browser.elementByCss('#photo-link').click()
    await retry(async () => {
      expect(await browser.elementByCss('#photo-page').text()).toBe(
        'photo page'
      )
    })
    expect(await browser.hasElementByCssSelector('#intercepted-photo')).toBe(
      false
    )
  })
})
