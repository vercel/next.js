import { nextTestSetup } from 'e2e-utils'

describe('use-cache-og-image-top-level-await', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // The prerendered output can't be observed in a deployment, and without
    // it nothing distinguishes broken from fixed behavior.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    beforeAll(async () => {
      await next.build({ args: ['--experimental-build-mode', 'compile'] })
    })

    it('should prerender a page whose opengraph image uses a top-level await', async () => {
      const { exitCode, cliOutput } = await next.build({
        args: [
          '--experimental-build-mode',
          'generate',
          '--debug-build-paths',
          'app/[slug]/page.tsx,app/[slug]/opengraph-image.tsx',
        ],
      })

      expect(cliOutput).not.toContain(
        'Unexpected cache miss after cache warming phase'
      )
      expect(cliOutput).not.toContain(
        'Next.js encountered uncached or runtime data in `generateMetadata()`'
      )
      expect(exitCode).toBe(0)

      // The image route uses generateStaticParams, so the build is expected
      // to prerender it for each param.
      expect(cliOutput).toMatch(/● \/first-post\/opengraph-image/)
      expect(cliOutput).toMatch(/● \/second-post\/opengraph-image/)
    })
  } else {
    beforeAll(async () => {
      await next.start()
    })

    it('should render a page whose opengraph image uses a top-level await', async () => {
      const $ = await next.render$('/first-post')
      expect($('article').text()).toBe('First Post')

      const res = await next.fetch('/first-post/opengraph-image')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
    })
  }
})
