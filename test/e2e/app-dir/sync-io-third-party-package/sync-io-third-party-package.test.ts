import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getRedboxDescription, openRedbox, retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'
import stripAnsi from 'strip-ansi'

// When a dependency reads the clock or randomness during prerendering, its
// frames are ignore-listed, so the error must name the package instead.
const thirdPartyCases = [
  // Bundled server dependency.
  { pathname: '/server-time', packageName: 'external-time', isBundled: true },
  // Server dependency in `serverExternalPackages`.
  {
    pathname: '/server-random',
    packageName: 'external-random',
    isBundled: false,
  },
  // Dependency rendered from a Client Component.
  { pathname: '/client-time', packageName: 'external-time', isBundled: true },
]

function getRedboxExplanation(browser: Playwright) {
  return browser.eval(() => {
    const portal = Array.from(document.querySelectorAll('nextjs-portal')).find(
      (p) => p.shadowRoot?.querySelector('[data-nextjs-dialog-header]')
    )
    const explanation = portal?.shadowRoot?.querySelector(
      '[data-nextjs-instant-explanation]'
    )
    return {
      text: explanation?.textContent ?? null,
      docsUrl: explanation?.querySelector('a')?.getAttribute('href') ?? null,
    }
  })
}

function messageSentence(packageName: string) {
  return `The call comes from the \`${packageName}\` package.`
}

function explanationFor(pathname: string) {
  return pathname === '/client-time'
    ? 'This value would be evaluated during the prerender, instead of recomputed on each visit.'
    : 'This value can change between renders, so it must be either prerendered or computed later.'
}

function docsUrlFor(pathname: string) {
  const slug =
    pathname === '/server-random'
      ? 'blocking-prerender-crypto'
      : pathname === '/client-time'
        ? 'blocking-prerender-current-time-client'
        : 'blocking-prerender-current-time'
  return `https://nextjs.org/docs/messages/${slug}`
}

// Deploy mode exclusion: This suite asserts local CLI output and the dev overlay.
// @force-gate !deploy
describe('sync-io-third-party-package', () => {
  const { next, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
    dependencies: {
      // `file:` installs a copy into node_modules like a published package.
      'external-time': 'file:./external-time',
      'external-random': 'file:./external-random',
    },
  })

  if (isNextDev) {
    it.each(thirdPartyCases)(
      'names the package in the redbox for $pathname',
      async ({ pathname, packageName }) => {
        const browser = await next.browser(pathname)
        await openRedbox(browser)

        await retry(async () => {
          expect(await getRedboxExplanation(browser)).toEqual({
            text: `${explanationFor(pathname)} The call comes from the ${packageName} package. Learn more`,
            docsUrl:
              docsUrlFor(pathname) +
              '#when-the-read-comes-from-an-external-library',
          })
        })
      }
    )

    it('does not name a package when app code reads the value', async () => {
      const browser = await next.browser('/user-time')
      await openRedbox(browser)

      await retry(async () => {
        expect(await getRedboxDescription(browser)).toContain(
          'Next.js encountered the unstable value'
        )
      })
      expect(await getRedboxExplanation(browser)).toEqual({
        text: `${explanationFor('/user-time')} Learn more`,
        docsUrl: docsUrlFor('/user-time'),
      })
    })
  } else {
    describe.each([
      { name: 'without --debug-prerender', isDebugPrerender: false },
      { name: 'with --debug-prerender', isDebugPrerender: true },
    ])('build $name', ({ isDebugPrerender }) => {
      beforeAll(async () => {
        const args = ['--experimental-build-mode', 'compile']
        if (isDebugPrerender) {
          args.push('--debug-prerender')
        }
        await next.build({ args })
      })

      const prerender = async (pathname: string) => {
        const cliOutputLength = next.cliOutput.length
        const args = [
          '--experimental-build-mode',
          'generate',
          '--debug-build-paths',
          `app${pathname}/page.tsx`,
        ]
        if (isDebugPrerender) {
          args.push('--debug-prerender')
        }
        // The build is expected to fail.
        await next.build({ args }).catch(() => {})
        return stripAnsi(next.cliOutput.slice(cliOutputLength))
      }

      it.each(thirdPartyCases)(
        'names the package for $pathname',
        async ({ pathname, packageName, isBundled }) => {
          const output = await prerender(pathname)

          expect(output).toContain(
            `Route "${pathname}": Next.js encountered the unstable value`
          )
          if (isBundled && !isTurbopack && !isDebugPrerender) {
            // Webpack only emits server source maps with `--debug-prerender`
            // (or `experimental.serverSourceMaps`). Without them, bundled
            // dependency code can't be told apart from app code, so the
            // message stays unchanged.
            expect(output).not.toContain('The call comes from')
          } else {
            expect(output).toContain(
              `${explanationFor(pathname)} ${messageSentence(packageName)}`
            )
            expect(output).toContain(
              '#when-the-read-comes-from-an-external-library'
            )
          }
        }
      )

      it('does not name a package when app code reads the value', async () => {
        const output = await prerender('/user-time')

        expect(output).toContain(
          'Route "/user-time": Next.js encountered the unstable value'
        )
        expect(output).not.toContain('The call comes from')
        expect(output).not.toContain(
          '#when-the-read-comes-from-an-external-library'
        )
      })
    })
  }

  afterAll(async () => {
    if (isNextStart) {
      await next.stop()
    }
  })
})
