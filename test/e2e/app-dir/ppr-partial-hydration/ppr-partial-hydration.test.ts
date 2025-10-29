// CASES:
// shell + no metadata
// shell + streaming metadata
// no shell + no metadata
// no shell + streaming metadata

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('PPR - partial hydration', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // the file-patching strategy we use for synchronizing the test doesn't work
    // on deployments
    skipDeployment: true,
  })

  if (isNextDev || skipped) {
    it.skip('only testable in production (non-deployment)', () => {})
    return
  }

  describe.each([
    {
      description: 'Static shell, no streaming metadata',
      path: '/with-shell/without-metadata',
    },
    {
      // Streaming metadata shouldn't affect streaming order, because if we have a static shell,
      // then RSC scripts (and thus hydration) don't need to wait for any HTML to be rendered.
      // I'm including it here for completeness.
      description: 'Static shell, streaming metadata',
      path: '/with-shell/with-streaming-metadata',
    },
    {
      description: 'No static shell, no streaming metadata',
      path: '/without-shell/without-metadata',
    },
    {
      // Streaming metadata is relevant, because it can affect how the HTML and RSC streams are interleaved.
      // If we have no static shell, RSC script tags won't be sent until the first SSR HTML chunk is sent.
      // Streaming metadata results in a HTML chunk, and thus it can affect this.
      description: 'No static shell, streaming metadata',
      path: '/without-shell/with-streaming-metadata',
    },
  ])('$description', ({ path }) => {
    it('should hydrate the shell without waiting for slow suspense boundaries', async () => {
      const browser = await next.browser(path, {
        waitHydration: false,
        waitUntil: 'commit', // do not wait for "load", we want to inspect the page as it streams in
      })

      // Initially, only the shell should be visible
      await retry(
        async () => {
          // The shell should be hydrated as soon as possible,
          // without waiting for the dynamic content
          expect(
            await browser
              .elementByCssInstant('#shell-hydrated')
              .getAttribute('data-is-hydrated')
          ).toBe('true')

          // The dynamic content hasn't streamed in yet, we should only see the fallback
          expect(
            await browser.elementByCssInstant('#dynamic-fallback').text()
          ).toContain('Loading...')
        },
        // This can take a while? It's unclear why... The delay appears pretty
        // random.
        /* duration */ 15_000 // ms
      )

      // Then, the slow content should stream in and hydrate (once
      // `slowComponentReady` is written)
      await next.patchFile('slowComponentReady', 'marker file', async () => {
        await retry(
          async () => {
            // The shell is already hydrated, this shouldn't change
            expect(
              await browser
                .elementByCssInstant('#shell-hydrated')
                .getAttribute('data-is-hydrated')
            ).toBe('true')

            // The dynamic content should be visible and hydrated
            expect(
              await browser.elementByCssInstant('#dynamic').text()
            ).toMatch(/Random value: \d+/)
            expect(
              await browser
                .elementByCssInstant('#dynamic-hydrated')
                .getAttribute('data-is-hydrated')
            ).toBe('true')
          },
          /* duration */ 10_000 // ms
        )
      })

      // If the HTML and RSC streams were interleaved correctly, we shouldn't be in quirks mode
      // (we would be happen if an RSC script was sent before `<!DOCTYPE html>`)
      expect(await browser.eval(() => document.compatMode)).not.toBe(
        'BackCompat'
      )
    })

    it('should produce a valid HTML document', async () => {
      // This test is meant to check if we're interleaving the HTML and RSC streams correctly.
      // In particular, RSC script tags should never appear before the initial HTML
      // (which could happen if we e.g. have no static shell and don't wait for it to be rendered before sending them)
      const response = await next.fetch(path)
      let body = ''
      response.body.on('data', (chunk) => {
        body += chunk.toString('utf-8')
      })
      await retry(() => {
        expect(response.status).toBe(200)
        // Ignore the sentinel. For pages with no static shell, it ends up at the front
        // and messes up the assertion.
        const trimmed = body.replace('<!-- PPR_BOUNDARY_SENTINEL -->', '')
        expect(trimmed).toStartWith('<!DOCTYPE html>')
      })
      await next.patchFile('slowComponentReady', 'marker file', async () => {
        await retry(() => {
          expect(body).toEndWith('</body></html>')
        })
      })
    })

    it('should display the shell without JS', async () => {
      // patch the marker file right away so that `load` finishes quickly
      await next.patchFile('slowComponentReady', 'marker file', async () => {
        const browser = await next.browser(path, {
          disableJavaScript: true,
          waitUntil: 'load', // Unlike the previous test, we want the page to load fully
        })

        expect(await browser.elementByCss('#shell').text()).toContain(
          'This is a page'
        )
        expect(
          await browser
            .elementByCss('#shell-hydrated')
            .getAttribute('data-is-hydrated')
        ).toBe('false')

        // The dynamic content can't be inserted into the document because we disabled JS,
        // so we should only see the fallback
        expect(
          await browser.elementByCss('#dynamic-fallback').text()
        ).toContain('Loading...')
      })
    })
  })
})
