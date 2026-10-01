import { nextTestSetup } from 'e2e-utils'
import {
  openRedbox,
  waitForRedbox,
  getRedboxDescription,
} from 'next-test-utils'

// These apps deliberately reject configuration or static validation and cannot
// be deployed. Build each real route in isolation.
// @force-gate !deploy
describe('param-matching-ensure-static-errors', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
    }
  })

  async function expectError(
    route: string,
    pathname: string,
    message: string,
    redboxState: 'open' | 'collapsed' = 'open'
  ) {
    if (isNextDev) {
      const browser = await next.browser(pathname)
      if (redboxState === 'collapsed') {
        // Static validation is reported as an issue after the dev render;
        // configuration errors throw before rendering and open the overlay.
        await openRedbox(browser)
      } else {
        await waitForRedbox(browser)
      }
      expect(await getRedboxDescription(browser)).toContain(message)
    } else {
      const result = await next.build({
        args: ['--debug-build-paths', `app/${route}/**/page.tsx`],
      })
      expect(result.cliOutput).not.toContain('did not match any files')
      expect(result.cliOutput).toContain(message)
      expect(result.exitCode).toBe(1)
    }
  }

  it.each([
    ['same-page', 'fallback'],
    ['dynamic', 'dynamic'],
    ['inherited', 'fallback'],
    ['generated', 'fallback'],
    ['instant-false', 'fallback'],
    ['parallel', 'fallback'],
  ])(
    'rejects %s matching with a useful configuration error',
    async (route, mode) => {
      await expectError(
        route,
        `/${route}/seed`,
        `Route "/${route}/[slug]" cannot configure parameter "slug" as "${mode}" with \`unstable_ensureStatic = "navigation"\`. Use "blocking" or "not-found" parameter matching, or remove the navigation constraint.`
      )
    }
  )

  it('still requires GSP examples for explicitly blocking params', async () => {
    await expectError(
      'missing',
      '/missing/seed',
      'Page "/missing/[slug]" is missing `generateStaticParams()`'
    )
  })

  it('still requires every parameter in the GSP result', async () => {
    await expectError(
      'incomplete',
      '/incomplete/t1/b1',
      'Every params object must include all dynamic route parameters. Missing: "bottom".'
    )
  })

  it('does not let blocking or instant=false bypass navigation validation', async () => {
    await expectError(
      'runtime-data',
      '/runtime-data/seed',
      'on a route that must be fully static',
      'collapsed'
    )
  })
})
