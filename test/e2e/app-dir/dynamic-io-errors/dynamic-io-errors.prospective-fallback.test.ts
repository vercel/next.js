import { nextTestSetup } from 'e2e-utils'

describe(`Dynamic IO Prospective Fallback`, () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/prospective-fallback',
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('should not error when visiting the page', async () => {
      // Start the server, we expect this to succeed.
      await next.start()

      const res = await next.fetch('/blog/123')
      expect(res.status).toBe(200)
    })
  } else {
    it('should error on the build due to a missing suspense boundary', async () => {
      try {
        await next.start()
      } catch {
        // we expect the build to fail
      }

      // TODO: Assert on component stack
      expect(next.cliOutput).toContain(
        'Route "/blog/[slug]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it.'
      )
    })

    it('should not error when we add the missing suspense boundary', async () => {
      await next.patchFile(
        'app/blog/[slug]/loading.jsx',
        `
        export default function Loading() {
          return <div>Loading...</div>
        }
      `
      )

      // We expect this to succeed.
      await next.start()

      expect(next.cliOutput).not.toContain(
        'Route "/blog/[slug]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it.'
      )
    })
  }
})
