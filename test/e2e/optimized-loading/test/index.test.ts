/* eslint-env jest */

import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Optimized loading', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '../'),
  })

  function runTests(url) {
    describe('page ' + url, () => {
      it(`should render the page ${url}`, async () => {
        const html = await next.render(url)
        expect(html).toMatch(/Hello World/)
      })

      it('should not have JS preload links', async () => {
        const $ = await next.render$(url)
        expect($('link[rel=preload]').length).toBe(0)
      })

      it('should load scripts with defer in head', async () => {
        const $ = await next.render$(url)
        expect($('script[async]').length).toBe(0)
        expect($('head script[defer]').length).toBeGreaterThan(0)
      })
    })
  }

  runTests('/')
  runTests('/page1')
})
