import { nextTestSetup } from '../../../lib/e2e-utils'

describe('cache components - postponing in client', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (!isNextStart) {
    // TODO: test validation behavior in dev
    it.skip('Build-time only test', () => {})
    return
  }

  const prerender = async (pathname: string) => {
    const args = [
      '--experimental-build-mode',
      'generate',
      '--debug-build-paths',
      `app${pathname}/page.tsx`,
    ]
    return await next.build({
      args,
      env: {
        NEXT_TEST_LOG_VALIDATION: '1',
      },
    })
  }

  beforeAll(async () => {
    await next.build({ args: ['--experimental-build-mode', 'compile'] })
  })

  // NOTE: These tests repro a bug that happens when the page
  // - doesn't suspend in a server component
  // - does suspend (postpone) in a client component.
  // Adding a server dynamic hole makes the build errors go away.

  describe('with suspense above body', () => {
    it('prerenders a page that suspends on params in a client component', async () => {
      const result = await prerender('/suspense-above-body/use-params/[slug]')
      expect(result.cliOutput).not.toContain('Error occurred prerendering page')
      expect(result.exitCode).toBe(0)
    })
    it('prerenders a page that suspends on search params in a client component', async () => {
      const result = await prerender('/suspense-above-body/use-search-params')
      expect(result.cliOutput).not.toContain('Error occurred prerendering page')
      expect(result.exitCode).toBe(0)
    })
  })
  describe('with suspense inside body', () => {
    it('prerenders a page that suspends on params in a client component', async () => {
      const result = await prerender('/suspense-inside-body/use-params/[slug]')
      expect(result.cliOutput).not.toContain('Error occurred prerendering page')
      expect(result.exitCode).toBe(0)
    })
    it('prerenders a page that suspends on search params in a client component', async () => {
      const result = await prerender('/suspense-inside-body/use-search-params')
      expect(result.cliOutput).not.toContain('Error occurred prerendering page')
      expect(result.exitCode).toBe(0)
    })
  })
  describe('with instant = false', () => {
    it('prerenders a page that suspends on params in a client component', async () => {
      const result = await prerender('/instant-false/use-params/[slug]')
      expect(result.cliOutput).not.toContain('Error occurred prerendering page')
      expect(result.exitCode).toBe(0)
    })
    it('prerenders a page that suspends on search params in a client component', async () => {
      const result = await prerender('/instant-false/use-search-params')
      expect(result.cliOutput).not.toContain('Error occurred prerendering page')
      expect(result.exitCode).toBe(0)
    })
  })
})
