import { nextTestSetup } from 'e2e-utils'
import fsp from 'fs/promises'
import path from 'path'

describe('500-page app-router-only', () => {
  const { next, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDeploy) {
    it('should render app router 500 page when route error', async () => {
      const $ = await next.render$('/route-error')
      expect($('html').attr('id')).toBe('__next_error__')
      expect($('body').text()).toContain('Internal Server Error.')
      expect($('body').text()).toContain('500')
    })
  }

  if (isNextStart) {
    it('should use app router to generate 500.html when no pages _error.tsx exists', async () => {
      const html = await fsp.readFile(
        path.join(next.testDir, '.next', 'server', 'pages', '500.html'),
        'utf8'
      )
      // Not use pages router to generate 500.html
      expect(html).toContain('__next_error__')
      expect(html).toContain('Internal Server Error.')
      // global-error is not used in app router 500.html
      expect(html).not.toContain('app-router-global-error')
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
          "/500": "pages/500.html",
        }
      `)
    })

    it('should not contain pages router routes default assets', async () => {
      // do not contain _app, _document, _error routes folder or files in .next/server/pages
      const pagesDir = path.join(next.testDir, '.next', 'server', 'pages')
      const files = await fsp.readdir(pagesDir)
      expect(files).not.toContain('500')
      expect(files).not.toContain('_app')
      expect(files).not.toContain('_document')
      expect(files).not.toContain('_error')
    })
  }
})
