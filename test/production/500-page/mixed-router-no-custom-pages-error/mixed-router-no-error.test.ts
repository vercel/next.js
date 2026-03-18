import { nextTestSetup } from 'e2e-utils'
import fsp from 'fs/promises'
import path from 'path'

describe('500-page - mixed-router-no-custom-pages-error', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not use app router global-error for 500.html when no pages _error.tsx exists', async () => {
    const $ = await next.render$('/pages-error')
    const text = $('#__next').text()
    expect(text).toContain('500')
    expect(text).toContain('Internal Server Error')
  })

  it('pages manifest should only contain 404 and 500', async () => {
    const pagesManifest = await fsp.readFile(
      path.join(next.testDir, '.next', 'server', 'pages-manifest.json'),
      'utf8'
    )
    const pagesManifestJson = JSON.parse(pagesManifest)
    expect(pagesManifestJson).toMatchInlineSnapshot(`
     {
       "/404": "pages/404.html",
       "/_app": "pages/_app.js",
       "/_document": "pages/_document.js",
       "/_error": "pages/_error.js",
       "/pages-error": "pages/pages-error.js",
     }
    `)
  })

  it('should generate 500.html with pages builtin _error', async () => {
    const html = await fsp.readFile(
      path.join(next.testDir, '.next', 'server', 'pages', '500.html'),
      'utf8'
    )
    expect(html).toContain('500')
    expect(html).toContain('Internal Server Error')
  })
})
