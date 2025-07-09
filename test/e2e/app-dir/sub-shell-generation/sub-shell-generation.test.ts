import { isNextDev, nextTestSetup } from 'e2e-utils'

describe('sub-shell-generation', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
  })

  if (isNextStart) {
    it('should fail with a validation error at build time', async () => {
      await expect(next.build()).toReject()
    })
  }

  it('should not fail when requesting /en/foo', async () => {
    if (isNextStart) {
      try {
        await next.start()
      } catch {
        // Ignoring for now, until the build actually fails, in which case this
        // whole test will be obsolete, and the test above will be sufficient.
      }
    }

    const res = await next.fetch('/en/foo')
    expect(res.status).toBe(200)
  })
})
