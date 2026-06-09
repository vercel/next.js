import { nextTestSetup } from 'e2e-utils'

describe('interception-static-prerender', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/94533.
  //
  // The intercepted target (`/login`) is statically prerendered. During static
  // prerendering the `Vary: next-url` header isn't set, so `couldBeIntercepted`
  // (the `i` field in the RSC payload) used to bake in as `false`. A CDN serving
  // that static artifact then taught the client the route wasn't interceptable,
  // and later client navigations served a stale, non-intercepted tree.
  //
  // The prerendered `.rsc` is exactly what a CDN serves, so asserting on it is
  // the deterministic guard: at runtime the server re-adds `Vary: next-url`,
  // which masks the bug in `next start` and a browser flow. Only `next start`
  // writes that artifact, so the assertion is a no-op in dev/deploy.
  it('marks the statically prerendered intercepted target as interceptable', async () => {
    if (!isNextStart) return
    expect(await next.readFile('.next/server/app/login.rsc')).toMatch(
      /"i":true/
    )
    // Non-target routes must not be marked.
    expect(await next.readFile('.next/server/app/index.rsc')).toMatch(
      /"i":false/
    )
  })
})
