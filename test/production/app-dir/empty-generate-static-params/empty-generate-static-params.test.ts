import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('empty-generate-static-params', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('should mark the page with empty generateStaticParams as SSG in build output', async () => {
    const isPPREnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'
    expect(next.cliOutput).toContain(`${isPPREnabled ? '◐' : '●'} /[slug]`)
  })

  it('should be a cache miss on the initial render followed by a HIT after being generated', async () => {
    const firstResponse = await next.fetch('/foo')
    expect(firstResponse.status).toBe(200)

    // With PPR enabled, the initial request doesn't send back a cache header
    const isPPREnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

    expect(firstResponse.headers.get('x-nextjs-cache')).toBe(
      isPPREnabled ? null : 'MISS'
    )

    retry(async () => {
      const secondResponse = await next.fetch('/foo')
      expect(secondResponse.status).toBe(200)
      expect(secondResponse.headers.get('x-nextjs-cache')).toBe('HIT')
    })
  })
})
