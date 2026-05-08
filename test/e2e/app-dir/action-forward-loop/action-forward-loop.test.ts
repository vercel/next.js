import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('action forward loop prevention', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  let cliOutputPosition: number = 0
  beforeEach(() => {
    cliOutputPosition = next.cliOutput.length
  })
  const getLogs = () => next.cliOutput.slice(cliOutputPosition)

  // Reproduces vercel/next.js#84504. The action is defined on
  // `/forward-target-route`, but middleware unconditionally rewrites that path
  // to `/no-action-route` (which has no workers entry for the action). On the
  // first hop the receiving worker sees `page=/no-action-route` and forwards
  // to the first worker, `/forward-target-route`. Without the fix, that
  // forwarded request goes back through middleware, gets rewritten the same
  // way, misses the workers manifest again, and forwards again — a loop that
  // continues until undici's headers timeout (~300s).
  //
  // With the fix, hop 1 sees `x-action-forwarded: 1` (set internally by hop 0's
  // `createForwardedActionResponse`), short-circuits the forwarding decision,
  // and falls through to local action handling. `serverModuleMap` lookup at
  // `/no-action-route` is empty, so the request resolves with the standard
  // "Failed to find Server Action" 404.
  it('does not loop when a forwarded request is repeatedly rewritten away from its workers entry', async () => {
    if (isNextDeploy || isNextDev) {
      // Tests the production path. Dev mode rebuilds per request and may
      // resolve the manifest differently across recompiles. Deploy topology
      // varies by platform.
      return
    }

    // Pull the real, build-time-computed action id out of the manifest so the
    // POST below targets the action this test fixture actually compiled.
    const manifestRaw = await next.readFile(
      '.next/server/server-reference-manifest.json'
    )
    const manifest = JSON.parse(manifestRaw) as {
      node: Record<string, { workers: Record<string, unknown> }>
    }
    const actionIds = Object.keys(manifest.node)
    expect(actionIds).toHaveLength(1)
    const actionId = actionIds[0]
    expect(manifest.node[actionId].workers).toMatchObject({
      'app/forward-target-route/page': expect.anything(),
    })

    // Bound the request explicitly so a regression fails fast (~10s) instead
    // of waiting for the 60s jest timeout. The non-loop path takes ~150ms.
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 10_000)

    const start = Date.now()
    const res = await next
      .fetch('/forward-target-route', {
        method: 'POST',
        headers: {
          'next-action': actionId,
          'content-type': 'text/plain;charset=UTF-8',
        },
        body: '{}',
        signal: controller.signal,
      })
      .finally(() => clearTimeout(abortTimer))
    const elapsed = Date.now() - start

    // Load-bearing assertion: should resolve quickly. Without the fix this
    // loops until undici's 300s headers timeout (or the abort fires above).
    expect(elapsed).toBeLessThan(5_000)

    // The forwarded hop's local action lookup misses (the receiving page is
    // `/no-action-route`, which has no workers entry for this action), so the
    // server logs the standard action-not-found error.
    await retry(async () => {
      expect(getLogs()).toInclude(`Failed to find Server Action "${actionId}"`)
    })

    // Drain the response body so the test doesn't leak an open connection.
    await res.text()
  })
})
