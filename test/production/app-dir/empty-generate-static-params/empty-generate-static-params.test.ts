import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('empty-generate-static-params', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  // If we're not using cache components, there shouldn't be any build errors!
  if (process.env.__NEXT_CACHE_COMPONENTS !== 'true') {
    beforeAll(async () => {
      await next.start()
    })

    it('should mark the page with empty generateStaticParams as SSG in build output', async () => {
      const isPPREnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'
      expect(next.cliOutput).toContain(`${isPPREnabled ? '◐' : '●'} /[slug]`)
    })

    it('should be a cache miss on the initial render followed by a HIT after being generated', async () => {
      const firstResponse = await next.fetch('/foo')
      expect(firstResponse.status).toBe(200)

      // With PPR enabled, the initial request doesn't send back a cache header
      const isPPREnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

      expect(firstResponse.headers.get('x-nextjs-cache')).toBe(
        isPPREnabled ? null : 'MISS'
      )

      retry(async () => {
        const secondResponse = await next.fetch('/foo')
        expect(secondResponse.status).toBe(200)
        expect(secondResponse.headers.get('x-nextjs-cache')).toBe('HIT')
      })
    })
  } else {
    it('should throw an error when generateStaticParams returns an empty array', async () => {
      await expect(() => next.start()).rejects.toThrow()

      expect(next.cliOutput).toContain(
        'https://nextjs.org/docs/messages/empty-generate-static-params'
      )
    })
  }
})
