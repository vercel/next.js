import { nextTestSetup } from 'e2e-utils'
import * as cheerio from 'cheerio'

describe('sub-shell-generation', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it.skip('skipping dev test', () => {})
    return
  }

  describe('should serve the correct shell', () => {
    describe.each([
      [
        '/[lang]/[slug]',
        {
          page: 'Page: (runtime)',
          langLayout: 'Lang Layout: (runtime)',
          rootLayout: 'Root Layout: (buildtime)',
        },
        ['/es/1', '/es/2'],
        true,
      ],
      [
        '/en/[slug]',
        {
          page: 'Page: (runtime)',
          langLayout: 'Lang Layout: (buildtime)',
          rootLayout: 'Root Layout: (buildtime)',
        },
        ['/en/1', '/en/2'],
        true,
      ],
      [
        '/fr/[slug]',
        {
          page: 'Page: (runtime)',
          langLayout: 'Lang Layout: (buildtime)',
          rootLayout: 'Root Layout: (buildtime)',
        },
        ['/fr/2', '/fr/3'],
        true,
      ],
      [
        '/fr/1',
        {
          page: 'Page: (buildtime)',
          langLayout: 'Lang Layout: (buildtime)',
          rootLayout: 'Root Layout: (buildtime)',
        },
        ['/fr/1'],
        false,
      ],
    ])('%s', (shell, { page, langLayout, rootLayout }, paths, isPostponed) => {
      it.each(paths)('should serve the correct shell for %s', async (path) => {
        const res = await next.fetch(path)
        expect(res.status).toBe(200)

        if (isNextDeploy) {
          expect(res.headers.get('x-matched-path')).toBe(shell)
        } else {
          expect(res.headers.get('x-nextjs-postponed')).toBe(
            isPostponed ? '1' : null
          )
        }

        const html = await res.text()
        const $ = cheerio.load(html)

        expect({
          page: $('#page').text(),
          langLayout: $('#lang-layout').text(),
          rootLayout: $('#root-layout').text(),
        }).toEqual({
          page,
          langLayout,
          rootLayout,
        })
      })
    })
  })
})
