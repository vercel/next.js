import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('SSG Prerender', () => {
  describe('development mode getStaticPaths', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        firebase: '7.14.5',
      },
      nextConfig: {
        experimental: {
          cpus: 1,
        },
      },
    })

    it('should work with firebase import and getStaticPaths', async () => {
      const html = await next.render('/blog/post-1')
      expect(html).toContain('post-1')
      expect(html).not.toContain('Error: Failed to load')

      const html2 = await next.render('/blog/post-1')
      expect(html2).toContain('post-1')
      expect(html2).not.toContain('Error: Failed to load')
    })

    it('should not cache getStaticPaths errors', async () => {
      const errMsg = /The `fallback` key must be returned from getStaticPaths/

      await retry(async () => {
        const html = await next.render('/blog/post-1')
        expect(html).toMatch(/post-1/)
      })

      await next.patchFile(
        'pages/blog/[post]/index.js',
        (content) =>
          content!.replace('fallback: true,', '/* fallback: true, */'),
        async () => {
          await retry(async () => {
            const html = await next.render('/blog/post-1')
            expect(html).toMatch(errMsg)
          })
        }
      )

      await retry(async () => {
        const html = await next.render('/blog/post-1')
        expect(html).toMatch(/post-1/)
      })
    })
  })
})
