import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'interception-routes-rewrites-hmr',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node node_modules/next/dist/bin/next dev',
      startServerTimeout: 30_000,
    })

    async function renderWithNextUrl(pathname: string) {
      const res = await next.fetch(pathname, {
        headers: {
          'Next-URL': '/',
        },
      })

      return res.text()
    }

    it('replaces generated interception rewrites when an intercepting route folder is renamed', async () => {
      const initialHtml = await renderWithNextUrl('/photo')
      expect(initialHtml).toContain('Slot photo')
      expect(initialHtml).not.toContain('Full photo')

      try {
        await next.renameFolder('app/@slot/(.)photo', 'app/@slot/(.)picture')
        await next.patchFile('app/@slot/(.)picture/page.js', (content) =>
          content.replace('Slot photo', 'Slot picture')
        )

        await retry(async () => {
          const pictureHtml = await renderWithNextUrl('/picture')
          expect(pictureHtml).toContain('Slot picture')
          expect(pictureHtml).not.toContain('Full picture')

          const photoHtml = await renderWithNextUrl('/photo')
          expect(photoHtml).toContain('Full photo')
          expect(photoHtml).not.toContain('Slot photo')
        })
      } finally {
        await next
          .renameFolder('app/@slot/(.)picture', 'app/@slot/(.)photo')
          .catch(() => {})
        await next.patchFile('app/@slot/(.)photo/page.js', (content) =>
          content.replace('Slot picture', 'Slot photo')
        )
      }
    })
  }
)
