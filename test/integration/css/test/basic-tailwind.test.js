/* eslint-env jest */
import { createNext, FileRef } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

//[NOTE]: This test is migrated from next-dev integration tests for turbopack,
//Extracted into a single test file so we can put this in blocking tests for turbopack (turbopack-tests-manifests.js)
describe('Render css with tailwind', () => {
  const appDir = join(fixturesDir, 'with-tailwindcss')

  let next
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(appDir, 'pages')),
        styles: new FileRef(join(appDir, 'styles')),
        'postcss.config.js': new FileRef(join(appDir, 'postcss.config.js')),
        'tailwind.config.js': new FileRef(join(appDir, 'tailwind.config.js')),
      },
      dependencies: {
        postcss: '^8.4.29',
        tailwindcss: '^3.3.3',
        autoprefixer: '^10.4.13',
      },
    })
  })

  afterAll(() => next?.destroy())

  it('should apply global styles', async () => {
    let browser
    try {
      browser = await webdriver(next.url, '/')

      const alignItems = await browser.eval(
        `window.getComputedStyle(document.querySelector('footer')).alignItems`
      )
      expect(alignItems).toMatchInlineSnapshot(`"center"`)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
