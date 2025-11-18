import { nextTestSetup } from 'e2e-utils'

describe('app-dir parallel-routes-static', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should static generate parallel routes', async () => {
    const rscExtension = process.env.__NEXT_CACHE_COMPONENTS
      ? '.prefetch.rsc'
      : '.rsc'
    expect(await next.hasFile('.next/server/app/nested/foo.html')).toBe(true)
    expect(await next.hasFile('.next/server/app/nested/foo.meta')).toBe(true)
    expect(
      await next.hasFile(`.next/server/app/nested/foo${rscExtension}`)
    ).toBe(true)

    expect(await next.hasFile('.next/server/app/nested/bar.html')).toBe(true)
    expect(await next.hasFile('.next/server/app/nested/bar.meta')).toBe(true)
    expect(
      await next.hasFile(`.next/server/app/nested/bar${rscExtension}`)
    ).toBe(true)
  })
})
