import { nextTestSetup } from 'e2e-utils'

describe('prefetch-inlining-dynamic-routes', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('disabled in development', () => {})
    return
  }

  it('should build successfully with prefetchInlining and dynamic routes', async () => {
    // Verify that the build succeeded by checking that the page renders.
    const $ = await next.render$('/posts/hello')
    expect($('#post').text()).toBe('hello')
  })

  it('should produce _inlined segment paths in the route metadata', async () => {
    const meta = JSON.parse(
      await next.readFile('.next/server/app/posts/[slug].meta')
    )

    // With prefetchInlining enabled, the segment paths should contain
    // /_inlined entries instead of /__PAGE__ entries.
    expect(meta.segmentPaths).toBeDefined()
    expect(meta.segmentPaths.length).toBeGreaterThanOrEqual(1)

    const hasInlined = meta.segmentPaths.some((p: string) =>
      p.includes('/_inlined')
    )
    const hasPage = meta.segmentPaths.some((p: string) =>
      p.includes('/__PAGE__')
    )

    expect(hasInlined).toBe(true)
    expect(hasPage).toBe(false)
  })
})
