import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import { join } from 'path'

// react-loadable-manifest.json is a webpack-only artifact.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'pages and app router sharing a next/dynamic module',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    const LOADABLE_ID =
      /loadableGenerated:\s*\{\s*webpack:\s*\(\)\s*=>\s*\[(\d+)\]/g

    let manifestId: string
    let pagesIds: Set<string>

    beforeAll(async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/react-loadable-manifest.json')
      )
      const key = Object.keys(manifest).find((k) =>
        k.endsWith('components/Shared.jsx -> ./Lazy')
      )
      if (!key) {
        throw new Error(
          'react-loadable-manifest.json has no entry for components/Shared.jsx -> ./Lazy'
        )
      }
      manifestId = String(manifest[key].id)

      // Pages entry chunks are pages-layer by construction; collect every
      // dynamic() module id they ask for.
      const pagesChunksDir = join(next.testDir, '.next/static/chunks/pages')
      pagesIds = new Set()
      for (const file of fs.readdirSync(pagesChunksDir)) {
        if (!file.endsWith('.js')) continue
        const source = fs.readFileSync(join(pagesChunksDir, file), 'utf8')
        for (const match of source.matchAll(LOADABLE_ID)) {
          pagesIds.add(match[1])
        }
      }
    })

    it('records the pages-layer module id in react-loadable-manifest.json', () => {
      expect(pagesIds.size).toBeGreaterThan(0)
      expect(pagesIds.has(manifestId)).toBe(true)
    })

    it('lists only pages-layer ids in __NEXT_DATA__.dynamicIds and hydrates without a mismatch', async () => {
      // React reports the hydration mismatch through reportError, which reaches
      // Playwright as a page error rather than a console message.
      const browser = await next.browser('/', { pushErrorAsConsoleLog: true })
      await retry(async () => {
        expect(await browser.elementByCss('#lazy').text()).toBe(
          'lazy component, server-rendered'
        )
      })

      // Every id the server asks the pages client to preload must be one the
      // pages client actually has; an App Router id here is what leaves Lazy
      // un-preloaded at hydration.
      const dynamicIds: number[] = await browser.eval(
        'window.__NEXT_DATA__.dynamicIds'
      )
      expect(dynamicIds.length).toBeGreaterThan(0)
      for (const id of dynamicIds) {
        expect(pagesIds.has(String(id))).toBe(true)
      }

      const logs = await browser.log()
      const hydrationErrors = logs.filter(({ message }) =>
        /Minified React error #418|Hydration failed/.test(message)
      )
      expect(hydrationErrors).toEqual([])
    })
  }
)
