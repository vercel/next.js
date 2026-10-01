import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('background revalidation timeout', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('serves stale content while a revalidation hangs and retries after its timeout', async () => {
    const $ = await next.render$('/')
    expect($('#generation').text()).toBe('build')

    // Poll until the build entry is stale and starts its first revalidation.
    // Requests must still receive the stale page while its generator hangs.
    await retry(async () => {
      const stale = await next.render$('/')
      expect(stale('#generation').text()).toBe('build')
      expect(next.cliOutput).toContain('Background revalidation attempt: 1')
    }, 10_000)

    // A later request must be able to start a new generation instead of
    // remaining pinned to the abandoned promise in the response batcher.
    await retry(async () => {
      const recovered = await next.render$('/')
      expect(recovered('#generation').text()).toBe('revalidation-2')
    }, 30_000)

    expect(next.cliOutput).toContain('Background revalidation attempt: 2')
    expect(next.cliOutput).toContain('Revalidation for / timed out')
  })
})
