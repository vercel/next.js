import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import {
  getRedboxLabel,
  openRedbox,
  retry,
  waitForRedbox,
} from 'next-test-utils'

const bodyError =
  /Next\.js encountered (?:uncached|runtime|uncached or runtime) data on a route that must be fully static/
const cases = [
  { route: '/connection', error: bodyError, provenance: true },
  { route: '/request', error: bodyError, provenance: true },
  { route: '/uncached', error: bodyError, provenance: true },
  { route: '/unused-request-and-uncached', error: bodyError, provenance: true },
  { route: '/private-cache', error: bodyError, provenance: true },
  { route: '/short-expire', error: bodyError, provenance: true },
  { route: '/short-stale', error: bodyError, provenance: true },
  { route: '/zero-revalidate', error: bodyError, provenance: true },
  { route: '/instant-false', error: bodyError, provenance: true },
  { route: '/policy-false', error: bodyError, provenance: true },
  { route: '/policy-shell', error: bodyError, provenance: true },
  { route: '/policy-prefetch', error: bodyError, provenance: true },
  { route: '/policy-navigation', error: bodyError, provenance: true },
  {
    route: '/transferred-promise',
    error:
      /data that is not available during a static prerender, but is unable to provide a location/,
    provenance: true,
  },
  {
    route: '/metadata',
    error:
      /data in `generateMetadata\(\)` on a route that must be fully static/,
    provenance: true,
  },
  {
    route: '/viewport',
    error:
      /data in `generateViewport\(\)` on a route that must be fully static/,
    provenance: true,
  },
  {
    route: '/sync-io',
    error: /Next\.js encountered the unstable value `Math\.random\(\)`/,
    provenance: true,
  },
  {
    route: '/missing/[slug]',
    pathname: '/missing/example',
    error: /missing .*"generateStaticParams\(\)".*"output: export"/,
  },
  {
    route: '/empty/[slug]',
    pathname: '/empty/example',
    error:
      /returned an empty array from "generateStaticParams\(\)".*"output: export"/,
  },
  {
    route: '/incomplete/[slug]/[part]',
    pathname: '/incomplete/first/example',
    error:
      /returned incomplete params from "generateStaticParams\(\)".*"output: export"/,
  },
  {
    route: '/nesting',
    error:
      /A child segment cannot override a parent segment with a less-constrained `ensureStatic`/,
  },
  {
    route: '/parallel',
    error: /Parallel slots cannot have incompatible `ensureStatic`/,
  },
  ...['blocking', 'fallback', 'dynamic'].map((mode) => ({
    route: `/matching-${mode}/[slug]`,
    pathname: `/matching-${mode}/known`,
    error: /must configure parameter "slug" as "not-found".*"output: export"/,
    matching: true,
  })),
]

// These assertions inspect local dev diagnostics and build failures.
// @force-gate !deploy
describe('Cache Components export validation', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: !isNextDev })

  beforeAll(async () => {
    if (isNextStart) {
      const result = await next.build({
        args: ['--experimental-build-mode', 'compile', '--debug-prerender'],
      })
      if (result.exitCode !== 0) {
        throw new Error(
          'Failed to compile export fixtures:\n' + result.cliOutput
        )
      }
    }
  })

  async function prerender(route: string) {
    const result = await next.build({
      args: [
        '--experimental-build-mode',
        'generate',
        '--debug-prerender',
        '--debug-build-paths',
        `app${route}/page.tsx`,
      ],
    })
    expect(result.cliOutput).not.toContain('did not match any files')
    return result
  }

  it.each(cases)('rejects $route', async ({ route, error, ...options }) => {
    let output: string
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser(
        'pathname' in options ? options.pathname : route
      )
      await retry(async () => {
        expect(next.cliOutput.slice(outputIndex)).toMatch(error)
      })
      output = next.cliOutput.slice(outputIndex)
      if (
        route === '/sync-io' ||
        route === '/connection' ||
        route === '/metadata' ||
        route === '/viewport'
      ) {
        if (await browser.locateRedbox().isVisible()) {
          await waitForRedbox(browser)
        } else {
          await openRedbox(browser)
        }
        const guidance = await browser.eval(() => {
          const root = document.querySelector('nextjs-portal')!.shadowRoot!
          return {
            explanation: root.querySelector('[data-nextjs-instant-explanation]')
              ?.textContent,
            cards: Array.from(
              root.querySelectorAll('[data-nextjs-fix-card-description]'),
              (card) => card.textContent
            ),
            snippets: root.querySelector('[data-nextjs-card-grid]')
              ?.textContent,
          }
        })
        expect(guidance.explanation).toContain('output: "export"')
        expect(guidance.cards.length).toBeGreaterThan(0)
        expect(guidance.cards).not.toContain('Generate on every request')
        if (route === '/sync-io') {
          expect(guidance.cards).toEqual([
            'Cache the random value',
            'Render on the client',
          ])
          expect(guidance.snippets).not.toContain('await connection()')
        } else {
          expect(await getRedboxLabel(browser)).toBe('Static Route')
        }
      }
    } else {
      const result = await prerender(route)
      expect(result.exitCode).toBe(1)
      output = result.cliOutput
      expect(output).toMatch(error)
    }

    if ('provenance' in options) {
      expect(output).toContain('output: "export"')
    }
    if (route === '/unused-request-and-uncached') {
      expect(output).not.toMatch(/used `headers\(\)`/)
    }
    if (route === '/sync-io') {
      expect(output).not.toContain('Render at request time by adding')
    }
    if ('matching' in options) {
      expect(output).not.toContain('Use "blocking"')
      expect(output).not.toContain('remove the navigation constraint')
    }
  })

  // Compile this fixture separately because its Server Action manifest makes
  // the exporter reject every route before attempting the other prerenders.
  // @force-gate start
  describe('server references', () => {
    it('rejects a Server Action on an otherwise static page', async () => {
      await next.patchFile(
        'app/server-action/page.tsx',
        await next.readFile('fixtures/server-action.tsx')
      )
      const compiled = await next.build({
        args: [
          '--experimental-build-mode',
          'compile',
          '--debug-prerender',
          '--debug-build-paths',
          'app/server-action/page.tsx',
        ],
      })
      expect(compiled.exitCode).toBe(0)
      const result = await prerender('/server-action')
      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain(
        'Server Actions are not supported with static export'
      )
    })
  })
})
