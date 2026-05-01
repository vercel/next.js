/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'

const shouldSkip =
  (isNextStart && !!process.env.TURBOPACK_DEV) ||
  (isNextDev && !!process.env.TURBOPACK_BUILD)

;(shouldSkip ? describe.skip : describe)(
  'Default 404 Page with custom _error',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    it('should respond to 404 correctly', async () => {
      const res = await next.fetch('/404')
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('This page could not be found')
    })

    it('should render error correctly', async () => {
      const text = await next.render('/err')
      expect(text).toContain(isNextDev ? 'oops' : 'Internal Server Error')
    })

    it('should render index page normal', async () => {
      const html = await next.render('/')
      expect(html).toContain('hello from index')
    })
    ;(isNextStart ? it : it.skip)(
      'should set pages404 in routes-manifest correctly',
      async () => {
        const data = JSON.parse(
          await next.readFile('.next/routes-manifest.json')
        )
        expect(data.pages404).toBe(true)
      }
    )
    ;(isNextStart ? it : it.skip)('should have output 404.html', async () => {
      const pagesManifest = await next.readJSON(
        '.next/server/pages-manifest.json'
      )
      const page = pagesManifest['/404']
      expect(page.endsWith('.html')).toBe(true)
    })
  }
)
