import { nextTestSetup } from 'e2e-utils'

// Regression for the #82674 discarded-action change (#86151). A root CompanyProvider fires
// slow, non-revalidating Server Actions on mount; while they are in flight, a nested
// navigation (dashboard -> staff -> staff/[id]/schedule) commits behind the schedule route's
// loading boundary. Before the fix, the discarded action ran the rest of the queue
// mid-navigation, dropping the schedule segment (the page stays stale on /staff). Each
// iteration reloads one CPU-throttled browser to recreate the in-flight-action window — the
// throttle and reload-before-each-nav are what make the timing-sensitive drop reliable.
describe('segment-drop on a boundary-gated nested navigation (#86151)', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@tanstack/react-query': '^5.90.9',
      '@tanstack/react-table': '^8.21.2',
    },
  })

  // The segment drop is production-only (it needs the streamed loading boundary), so
  // this regression only runs in `next start` mode.
  if (isNextStart) {
    it('does not drop the schedule segment when provider actions settle mid-navigation', async () => {
      // Reproduced ~90% per iteration on the buggy client and 0% on the fixed one,
      // so a handful of reloads reliably catches a regression.
      const iterations = Number(process.env.ITER ?? 10)
      let dropped = 0

      // One throttled browser, reloaded each iteration — mirrors the external
      // repro's reload-before-each-nav, which recreates the cold-start window where
      // the provider's slow Server Actions are in flight during the navigation.
      const browser = await next.browser('/dashboard', { cpuThrottleRate: 6 })

      for (let i = 0; i < iterations; i++) {
        // Cold start (reload): remounts the CompanyProvider, firing its slow
        // on-mount Server Actions afresh.
        if (i > 0) await browser.get(`${next.url}/dashboard`)
        await browser.waitForElementByCss('[data-testid="dashboard-content"]')

        // Nav 1: dashboard -> staff.
        await browser.elementByCss('[data-testid="nav-staff"]').click()
        await browser.waitForElementByCss('[data-testid="staff-table"]')

        // Nav 2 (nested, boundary-gated): staff -> staff/[id]/schedule, while the
        // provider's on-mount actions are still in flight.
        await browser.elementByCss('[data-testid="staff-schedule"]').click()

        // The schedule segment must commit (become visible). A dropped navigation
        // leaves the page stale on /staff (or stuck in the skeleton), so a generous
        // timeout distinguishes a terminal drop from the slow server render.
        const appeared = await browser
          .waitForElementByCss('[data-testid="schedule-content"]', 10000)
          .then(() =>
            browser.eval(
              `(function () {
                var el = document.querySelector('[data-testid="schedule-content"]')
                if (!el) return false
                return el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null
              })()`
            )
          )
          .catch(() => false)

        if (!appeared) {
          dropped++
          const url = await browser.url()
          const staffStillShown = await browser.eval(
            `Boolean(document.querySelector('[data-testid="staff-table"]'))`
          )
          const skeleton = await browser.eval(
            `Boolean(document.querySelector('[data-testid="schedule-skeleton"]'))`
          )
          const routeLoading = await browser.eval(
            `Boolean(document.querySelector('[data-testid="route-loading"]'))`
          )
          require('console').log(
            `[sd86151] MISS #${i} url=${url} staffStillShown=${staffStillShown} skeleton=${skeleton} routeLoading=${routeLoading}`
          )
          // One reproduced drop proves the regression — stop rather than grind
          // through (and time out on) the remaining slow, throttled iterations.
          break
        }
      }

      require('console').log(
        `[sd86151] dropped=${dropped} (of up to ${iterations} reloads)`
      )

      expect(dropped).toBe(0)
    }, 240000)
  } else {
    it.skip('segment-drop regression runs in next start mode only', () => {})
  }
})
