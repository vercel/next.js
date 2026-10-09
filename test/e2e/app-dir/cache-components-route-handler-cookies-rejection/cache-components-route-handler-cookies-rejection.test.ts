import { nextTestSetup } from 'e2e-utils'

// The prerender-abort rejection this suite observes only happens during the
// build's prerender pass, so it cannot be reproduced in dev or deploy mode.
// @force-gate start
describe('cache-components-route-handler-cookies-rejection', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // TODO(cache-components): This documents current (incorrect) behavior. A
  // dynamic route handler that awaits `cookies()` inside a user-land
  // try/catch receives the internal prerender-abort rejection in its catch
  // block, so the build logs it as an application error even though the
  // route is correctly treated as dynamic. When this is fixed, the build
  // output should no longer contain the rejection and this expectation needs
  // to be updated.
  it('logs the prerender cookies() rejection into user code during build', async () => {
    expect(next.cliOutput).toContain('[getSession] failed to read cookies')
    expect(next.cliOutput).toContain(
      'During prerendering, `cookies()` rejects when the prerender is complete.'
    )
    expect(next.cliOutput).toContain('HANGING_PROMISE_REJECTION')
  })

  it('still completes the build and treats the route as dynamic', async () => {
    const res = await next.fetch('/api/user')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ session: null })
  })
})
