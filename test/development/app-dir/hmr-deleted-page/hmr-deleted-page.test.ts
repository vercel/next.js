import { join } from 'path'

import { nextTestSetup, FileRef } from 'e2e-utils'
import { retry, waitForRedbox, waitForNoRedbox } from 'next-test-utils'
import { waitForHydration } from 'development-sandbox'

describe('hmr-deleted-page', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
  })

  it('should not show errors for a deleted page', async () => {
    const browser = await next.browser('/page')
    expect(await browser.elementByCss('p').text()).toBe('nested hello world')

    await next.deleteFile('app/page/test.tsx')
    await next.deleteFile('app/page/style.css')
    await waitForHydration(browser)

    await waitForRedbox(browser)

    await next.deleteFile('app/page')
    await waitForHydration(browser)

    await waitForNoRedbox(browser)
    expect(await browser.elementByCss('h1').text()).toBe('404')
  })

  it('should discard manifests for deleted pages', async () => {
    expect(await next.render('/en/project')).toContain(
      'old localized project route'
    )
    expect(await next.render('/en/project/acme/home')).toContain(
      'old localized home route'
    )

    await next.deleteFile('app/[locale]/project/page.tsx')
    await next.deleteFile('app/[locale]/project/[projectId]/home/page.tsx')
    await next.patchFile(
      'app/[locale]/project/[[...slug]]/page.tsx',
      `export default function ProjectCatchAllPage() {
        return <main>new localized project catch-all</main>
      }`
    )

    await retry(async () => {
      for (const pathname of [
        '/en/project',
        '/en/project/acme/home',
        '/en/project/acme/schedule',
      ]) {
        const response = await next.fetch(pathname)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain(
          'new localized project catch-all'
        )
      }

      const appPathsManifest = JSON.parse(
        await next.readFile('.next/dev/server/app-paths-manifest.json')
      )
      expect(appPathsManifest['/[locale]/project/[[...slug]]/page']).toBe(
        'app/[locale]/project/[[...slug]]/page.js'
      )
      expect(appPathsManifest['/[locale]/project/page']).toBeUndefined()
      expect(
        appPathsManifest['/[locale]/project/[projectId]/home/page']
      ).toBeUndefined()
    })
  })
})
