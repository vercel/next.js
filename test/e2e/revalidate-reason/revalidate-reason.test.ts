import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('revalidate-reason', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    describe('development mode', () => {
      // in dev mode, the revalidateReason is called on every request, and will always be considered stale
      it('should support revalidateReason: "stale"', async () => {
        const res = await next.fetch('/')

        expect(res.status).toBe(200)

        expect(next.cliOutput).toContain(
          'revalidate-reason/pages/index.tsx revalidateReason: stale'
        )
      })
    })

    // skip the remaining tests as they do not apply in dev
    return
  }

  it('should support revalidateReason: "build"', async () => {
    expect(next.cliOutput).toContain(
      'revalidate-reason/pages/index.tsx revalidateReason: build'
    )
    expect(next.cliOutput).toContain(
      'revalidate-reason/pages/stale.tsx revalidateReason: build'
    )
  })

  it('should support revalidateReason: "on-demand"', async () => {
    const res = await next.fetch('/api/revalidate')

    expect(res.status).toBe(200)

    const $ = await next.render$('/')
    expect($('#reason').text()).toBe('revalidate reason: on-demand')
  })

  it('should support revalidateReason: "stale"', async () => {
    const res = await next.fetch('/stale')
    expect(res.status).toBe(200)

    // wait for the revalidation period
    await waitFor(5000)

    await retry(async () => {
      const $ = await next.render$('/stale')
      expect($('#reason').text()).toBe('revalidate reason: stale')
    })
  })
})
