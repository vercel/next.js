import { nextTestSetup, isNextDev } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

// This test inspects build artifacts in `.next/server/pages` that are not
// produced in dev mode.
;(isNextDev ? describe.skip : describe)('i18n-beforefiles-rewrite', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const locales = ['en', 'fr']

  // Auto-static pages (no getStaticProps / getServerSideProps) that should
  // only have locale-prefixed HTML in server/pages/ when i18n is configured.
  const autoStaticPages = [
    'index',
    'home/a',
    'home/b',
    'dynamic/static',
    'dynamic/[id]',
    '[teamId]/[slug]',
  ]

  it('should not produce non-locale-prefixed HTML files for auto-static pages', () => {
    const pagesDir = path.join(next.testDir, '.next/server/pages')

    for (const page of autoStaticPages) {
      const orphanPath = path.join(pagesDir, `${page}.html`)
      expect({
        page,
        exists: fs.existsSync(orphanPath),
      }).toEqual({ page, exists: false })
    }
  })

  it('should have locale-prefixed HTML files for auto-static pages', () => {
    const pagesDir = path.join(next.testDir, '.next/server/pages')

    for (const page of autoStaticPages) {
      for (const locale of locales) {
        const localePath =
          page === 'index'
            ? path.join(pagesDir, `${locale}.html`)
            : path.join(pagesDir, locale, `${page}.html`)
        expect({
          page: `${locale}/${page}`,
          exists: fs.existsSync(localePath),
        }).toEqual({ page: `${locale}/${page}`, exists: true })
      }
    }
  })

  it('should 404 for /rewrite-before-files', async () => {
    // beforeFiles rewrites /rewrite-before-files to /somewhere.
    // /somewhere does not match any page, so this should 404.
    // Before the fix, orphan [teamId]/[slug].html would incorrectly match.
    const res = await next.fetch('/rewrite-before-files')
    expect(res.status).toBe(404)
  })
})
