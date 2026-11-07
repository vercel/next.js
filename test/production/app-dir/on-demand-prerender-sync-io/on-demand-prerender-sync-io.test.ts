import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'

const RESPONSE_TIMEOUT = 10_000

async function fetchPage(
  next: NextInstance,
  pathname: string,
  init?: RequestInit
) {
  // Without a bound, a request that never gets a response would only fail on
  // the test timeout.
  const signal = AbortSignal.timeout(RESPONSE_TIMEOUT)

  try {
    return await next.fetch(pathname, { ...init, signal })
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `The server did not respond to ${pathname} within ${RESPONSE_TIMEOUT} ms.`
      )
    }
    throw error
  }
}

function getSyncIOError(pathname: string) {
  return `Route "${pathname}": Next.js encountered the unstable value \`Date.now()\``
}

describe('on-demand-prerender-sync-io', () => {
  describe('next start', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('responds with an error when a prerender after a revalidation performs sync IO', async () => {
      // The build prerendered the shell without sync IO.
      const prerendered = await fetchPage(next, '/sync-io')
      expect(prerendered.status).toBe(200)

      const revalidated = await next.fetch('/revalidate', { method: 'POST' })
      expect(revalidated.status).toBe(200)

      const outputIndex = next.cliOutput.length
      const response = await fetchPage(next, '/sync-io')
      expect(response.status).toBe(500)

      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain(
          getSyncIOError('/sync-io')
        )
      })
    })
  })

  // Synthesizes the invocation of a deployment adapter using private runtime
  // switches. In minimal mode the server prerenders the page for a document
  // request.
  describe('minimal mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        NEXT_PRIVATE_TEST_HEADERS: '1',
        NEXT_PRIVATE_MINIMAL_MODE: '1',
      },
    })

    it.each(['/sync-io', '/pending-iterable'])(
      'responds with an error when the prerender of %s performs sync IO',
      async (pathname) => {
        const outputIndex = next.cliOutput.length
        const response = await fetchPage(next, pathname, {
          headers: { 'x-matched-path': pathname },
        })
        expect(response.status).toBe(500)

        await retry(() => {
          expect(next.cliOutput.slice(outputIndex)).toContain(
            getSyncIOError(pathname)
          )
        })
      }
    )
  })
})
