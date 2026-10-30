import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readdirSync } from 'fs'

describe('app dir - css - experimental inline css with cache components', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  ;(isNextDev ? describe.skip : describe)('Production only', () => {
    if (!isNextDeploy) {
      it('should keep the stylesheets out of every RSC and segment file', async () => {
        const appDir = '.next/server/app'
        const rscFiles = readdirSync(join(next.testDir, appDir), {
          recursive: true,
          encoding: 'utf8',
        }).filter((file) => file.endsWith('.rsc'))

        // Both the page payloads and the segment prefetch payloads.
        expect(rscFiles).toContain('nested.rsc')
        expect(
          rscFiles.some((file) => file.startsWith('index.segments/'))
        ).toBe(true)

        for (const file of rscFiles) {
          const content = await next.readFile(join(appDir, file))
          expect(content).not.toContain('.inline-css-marker')
          expect(content).not.toContain('.nested-css-marker')
        }

        const html = await next.readFile(join(appDir, 'index.html'))
        expect(html.match(/\.inline-css-marker/g)).toHaveLength(1)
      })
    }

    // The same payloads over HTTP, so deployed runs check them too.
    it.each([
      { path: '/', pageSegment: '/__PAGE__' },
      { path: '/nested', pageSegment: '/nested/__PAGE__' },
    ])(
      'should keep the stylesheets out of the served prefetch payloads for $path',
      async ({ path, pageSegment }) => {
        for (const segment of ['/_tree', '/_full', pageSegment]) {
          const res = await next.fetch(path, {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
              'Next-Router-Segment-Prefetch': segment,
            },
          })
          expect(res.status).toBe(200)
          const body = await res.text()
          expect(body).not.toContain('.inline-css-marker')
          expect(body).not.toContain('.nested-css-marker')
        }
      }
    )

    it('should style the static shell and the resumed content', async () => {
      const browser = await next.browser('/')

      const dynamic = await browser.waitForElementByCss('#dynamic')
      expect(await dynamic.getComputedCss('color')).toBe('rgb(255, 255, 0)') // yellow

      expect(await browser.elementsByCss('style[data-href]')).toHaveLength(1)
      expect(
        await browser.elementsByCss('link[rel="stylesheet"]')
      ).toHaveLength(0)
    })

    it('should apply a nested layout stylesheet on client navigation', async () => {
      const browser = await next.browser('/')

      await browser.waitForElementByCss('#link-nested').click()
      const page = await browser.waitForElementByCss('#page-nested')

      expect(await page.getComputedCss('font-size')).toBe('100px')
      expect(await page.getComputedCss('color')).toBe('rgb(255, 255, 0)') // yellow
    })

    it('should inline both stylesheets once on a direct load of the nested route', async () => {
      const html = await next.render('/nested')

      expect(html.match(/\.inline-css-marker/g)).toHaveLength(1)
      expect(html.match(/\.nested-css-marker/g)).toHaveLength(1)
    })
  })
})
