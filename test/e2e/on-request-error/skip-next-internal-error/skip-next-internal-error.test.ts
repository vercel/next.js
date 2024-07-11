import { nextTestSetup } from 'e2e-utils'

describe('on-request-error - skip-next-internal-error.test', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      __NEXT_EXPERIMENTAL_INSTRUMENTATION: '1',
    },
  })

  async function assertNoNextjsInternalErrors(
    pathname: string,
    expectedStatus = 200
  ) {
    const { status } = await next.fetch(pathname)
    expect(status).toBe(expectedStatus)

    const output = next.cliOutput
    // No navigation errors
    expect(output).not.toContain('NEXT_REDIRECT')
    expect(output).not.toContain('NEXT_NOT_FOUND')
    // No dynamic usage errors
    expect(output).not.toContain('DYNAMIC_SERVER_USAGE')
    // No react postpone errors
    // TODO: cover PPR errors later
    expect(output).not.toContain('react.postpone')
  }

  describe('app router render', () => {
    // Server navigation errors
    it('should not catch server component not-found errors', async () => {
      await assertNoNextjsInternalErrors('/server/not-found', 404)
    })

    it('should not catch server component redirect errors', async () => {
      await assertNoNextjsInternalErrors('/server/redirect')
    })

    // Client navigation errors
    it('should not catch client component not-found errors', async () => {
      await assertNoNextjsInternalErrors('/client/not-found', 404)
    })

    it('should not catch client component redirect errors', async () => {
      await assertNoNextjsInternalErrors('/client/redirect')
    })

    // Dynamic usage
    it('should not catch server component dynamic usage errors', async () => {
      await assertNoNextjsInternalErrors('/client/dynamic-fetch')
    })

    it('should not catch client component dynamic usage errors', async () => {
      await assertNoNextjsInternalErrors('/client/dynamic-fetch')
    })

    // No SSR
    it('should not catch next dynamic no-ssr errors', async () => {
      await assertNoNextjsInternalErrors('/client/no-ssr')
    })
  })

  describe('app router API', () => {
    // API routes navigation errors
    it('should not catch server component not-found errors', async () => {
      await assertNoNextjsInternalErrors('/app-route/not-found', 404)
    })

    it('should not catch server component redirect errors', async () => {
      await assertNoNextjsInternalErrors('/app-route/redirect')
    })
  })
})
