import { nextTestSetup } from 'e2e-utils'

describe('on-request-error - skip-next-internal-error.test', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      __NEXT_EXPERIMENTAL_INSTRUMENTATION: '1',
    },
  })

  if (skipped) {
    return
  }

  async function assertNoNextjsInternalErrors() {
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
      await next.fetch('/server/not-found')
      await assertNoNextjsInternalErrors()
    })

    it('should not catch server component redirect errors', async () => {
      await next.render('/server/redirect')
      await assertNoNextjsInternalErrors()
    })

    // Client navigation errors
    it('should not catch client component not-found errors', async () => {
      await next.fetch('/server/not-found')
      await assertNoNextjsInternalErrors()
    })

    it('should not catch client component redirect errors', async () => {
      await next.render('/client/redirect')
      await assertNoNextjsInternalErrors()
    })

    // Dynamic usage
    it('should not catch server component dynamic usage errors', async () => {
      await next.fetch('/server/dynamic-fetch')
      await assertNoNextjsInternalErrors()
    })

    it('should not catch client component dynamic usage errors', async () => {
      await next.fetch('/client/dynamic-fetch')
      await assertNoNextjsInternalErrors()
    })

    // No SSR
    it('should not catch next dynamic no-ssr errors', async () => {
      await next.fetch('/client/no-ssr')
      await assertNoNextjsInternalErrors()
    })
  })

  describe('app router API', () => {
    // API routes navigation errors
    it('should not catch server component not-found errors', async () => {
      await next.render('/app-route/not-found')
      await assertNoNextjsInternalErrors()
    })

    it('should not catch server component redirect errors', async () => {
      await next.render('/app-route/redirect')
      await assertNoNextjsInternalErrors()
    })
  })
})
