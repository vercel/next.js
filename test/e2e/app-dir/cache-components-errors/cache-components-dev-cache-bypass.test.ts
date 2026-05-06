import { isNextDev, nextTestSetup } from 'e2e-utils'

describe('Cache Components Errors', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/dev-cache-bypass',
  })

  if (skipped) {
    return
  }

  describe('Warning for Bypassing Caches in Dev', () => {
    async function enableDraftMode() {
      const draftRes = await next.fetch('/api/draft/enable', {
        redirect: 'manual',
      })
      const setCookie = draftRes.headers.get('set-cookie')
      const cookie = setCookie?.split(';', 1)[0]

      expect(cookie).toBeTruthy()
      return cookie!
    }

    if (isNextDev) {
      it('warns if you render with cache-control: no-cache in dev on initial page load', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/', {
          headers: { 'cache-control': 'no-cache' },
        })

        expect(stripGetLines(next.cliOutput.slice(from)))
          .toMatchInlineSnapshot(`
         "Route / is rendering with server caches disabled. For this navigation, Component Metadata in React DevTools will not accurately reflect what is statically prerenderable and runtime prefetchable. See more info here: https://nextjs.org/docs/messages/cache-bypass-in-dev
         "
        `)
      })

      it('warns if you render with cache-control: no-cache in dev on client navigation', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/other', {
          headers: { 'cache-control': 'no-cache', RSC: '1' },
        })

        expect(stripGetLines(next.cliOutput.slice(from)))
          .toMatchInlineSnapshot(`
         "Route /other is rendering with server caches disabled. For this navigation, Component Metadata in React DevTools will not accurately reflect what is statically prerenderable and runtime prefetchable. See more info here: https://nextjs.org/docs/messages/cache-bypass-in-dev
         "
        `)
      })

      it('does not warn if you render without cache-control: no-cache in dev on initial page load', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/')

        expect(stripGetLines(next.cliOutput.slice(from))).toMatchInlineSnapshot(
          `""`
        )
      })

      it('does not warn if you render without cache-control: no-cache in dev on client navigation', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/', {
          headers: { RSC: '1' },
        })

        expect(stripGetLines(next.cliOutput.slice(from))).toMatchInlineSnapshot(
          `""`
        )
      })

      it('warns if draftMode is enabled in dev', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length
        const cookie = await enableDraftMode()

        await next.fetch('/draft', {
          headers: { Cookie: cookie },
        })

        expect(stripGetLines(next.cliOutput.slice(from)))
          .toMatchInlineSnapshot(`
         "Route /draft is rendering with server caches disabled. For this navigation, Component Metadata in React DevTools will not accurately reflect what is statically prerenderable and runtime prefetchable. See more info here: https://nextjs.org/docs/messages/cache-bypass-in-dev
         "
        `)
      })
    } else {
      it('does not warn if you render with cache-control: no-cache in dev on initial page load', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/', {
          headers: { 'cache-control': 'no-cache' },
        })

        expect(stripGetLines(next.cliOutput.slice(from))).toMatchInlineSnapshot(
          `""`
        )
      })

      it('does not warn if you render with cache-control: no-cache in dev on client navigation', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/', {
          headers: { 'cache-control': 'no-cache' },
        })

        expect(stripGetLines(next.cliOutput.slice(from))).toMatchInlineSnapshot(
          `""`
        )
      })

      it('does not warn if you render without cache-control: no-cache in dev on initial page load in start', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/')

        expect(stripGetLines(next.cliOutput.slice(from))).toMatchInlineSnapshot(
          `""`
        )
      })

      it('does not warn if you render without cache-control: no-cache in dev on client navigation in start', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length

        await next.fetch('/', {
          headers: { RSC: '1' },
        })

        expect(stripGetLines(next.cliOutput.slice(from))).toMatchInlineSnapshot(
          `""`
        )
      })

      it('does not warn if draftMode is enabled in start', async () => {
        // Wait for pages to be loaded to ensure the logging for the test page is the only thing that can be logged.
        await next.fetch('/404')
        const from = next.cliOutput.length
        const cookie = await enableDraftMode()

        await next.fetch('/draft', {
          headers: { Cookie: cookie },
        })

        expect(stripGetLines(next.cliOutput.slice(from))).toMatchInlineSnapshot(
          `""`
        )
      })
    }
  })
})

function stripGetLines(input: string): string {
  return input
    .replace(/^\s*GET.*(?:\r?\n|$)/gm, '')
    .replace(/^\s*[○✓].*(?:\r?\n|$)/gm, '')
}
