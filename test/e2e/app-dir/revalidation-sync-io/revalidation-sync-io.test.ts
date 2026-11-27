import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { NextDeployInstance } from '../../../lib/next-modes/next-deploy'

const RESPONSE_TIMEOUT = 10_000
const pathPrefix = '/revalidation-sync-io'

async function fetchPage(next: NextInstance, pathname: string) {
  const signal = AbortSignal.timeout(RESPONSE_TIMEOUT)
  try {
    const response = await next.fetch(pathname, { signal })
    const body = await response.text()
    return { response, body }
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `The server did not finish responding to ${pathname} within ${RESPONSE_TIMEOUT} ms.`
      )
    }
    throw error
  }
}

// Revalidation regenerates the production response cache.
// @force-gate prod
describe('sync IO during revalidation', () => {
  const { next, isNextDeploy } = nextTestSetup({ files: __dirname })

  it('serves the page created at build time', async () => {
    const { response, body } = await fetchPage(next, `${pathPrefix}/sync-io`)
    expect(response.status).toBe(200)
    expect(body).toContain('id="now">0</p>')
  })

  it.each(['sync-io', 'pending-iterable'])(
    'reports sync IO errors during revalidation of %s',
    async (page) => {
      const pathname = `${pathPrefix}/${page}`
      const getOutput = next.getCliOutputFromHere()
      const since = new Date()
      const revalidated = await next.fetch(`${pathPrefix}/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pathname }),
      })
      expect(revalidated.status).toBe(200)

      const deadline = Date.now() + 30_000
      // Each retry requests the page so revalidation can start. The deployment
      // may serve the cached page before invalidation propagates.
      await retry(
        async () => {
          const { response, body } = await fetchPage(next, pathname)
          if (isNextDeploy) {
            // Vercel retains the cached page when revalidation fails.
            expect(response.status).toBe(200)
            expect(body).toContain('id="now">0</p>')
          } else {
            expect(response.status).toBe(500)
            expect(body).not.toBe('')
          }

          // Custom deploy scripts do not expose runtime logs through the
          // harness.
          if (
            isNextDeploy &&
            (process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH ||
              process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH)
          ) {
            return
          }

          const output = isNextDeploy
            ? await (next as NextDeployInstance).getRuntimeLogs({
                since,
                deadline,
              })
            : getOutput()
          expect(output).toContain(
            `Route "${pathname}": Next.js encountered the unstable value \`Date.now()\``
          )
        },
        isNextDeploy ? 30_000 : 3000
      )
    }
  )
})
