import { nextTestSetup } from 'e2e-utils'

describe('revalidate-only-generated-prerendered-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // A request that never answers fails the test instead of the run.
  const withTimeout = () => ({ signal: AbortSignal.timeout(30_000) })

  // The build generates `/generated/1` and the not-found page. With
  // `unstable_onlyGenerated` another path of the route answers 404 instead of
  // rendering, and `res.revalidate()` resolves. That 404 is not an error.
  it('answers without an error when the path was never generated', async () => {
    const logStart = next.cliOutput.length

    const res = await next.fetch(
      '/api/revalidate?path=/generated/2',
      withTimeout()
    )
    expect(await res.json()).toEqual({ revalidated: true })

    const $ = await next.render$('/generated/2', undefined, withTimeout())
    expect($('#route').text()).toBe('generated 2')

    expect(next.cliOutput.slice(logStart)).not.toMatch(/invariant/i)
  })

  // Calls for the same path at the same time share one cache lookup, and each
  // of them has to get its own answer.
  it('answers every call when a path is revalidated twice at once', async () => {
    const logStart = next.cliOutput.length

    const res = await next.fetch(
      '/api/revalidate?path=/generated/3&path=/generated/3',
      withTimeout()
    )
    expect(await res.json()).toEqual({ revalidated: true })

    const $ = await next.render$('/generated/3', undefined, withTimeout())
    expect($('#route').text()).toBe('generated 3')

    expect(next.cliOutput.slice(logStart)).not.toMatch(/invariant/i)
  })
})
