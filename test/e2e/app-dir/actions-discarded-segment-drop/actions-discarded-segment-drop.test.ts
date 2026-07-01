import { nextTestSetup } from 'e2e-utils'

describe('segment-drop on a boundary-gated nested navigation (#86151)', () => {
  const { next, isNextStart } = nextTestSetup({ files: __dirname })

  if (isNextStart) {
    it('does not drop the schedule segment when provider actions settle mid-navigation', async () => {
      const iterations = Number(process.env.ITER ?? 10)
      let dropped = 0
      const browser = await next.browser('/dashboard', { cpuThrottleRate: 6 })
      for (let i = 0; i < iterations; i++) {
        if (i > 0) await browser.get(`${next.url}/dashboard`)
        await browser.waitForElementByCss('[data-testid="dashboard-content"]')
        await browser.elementByCss('[data-testid="nav-staff"]').click()
        await browser.waitForElementByCss('[data-testid="staff-table"]')
        await browser.elementByCss('[data-testid="staff-schedule"]').click()
        const appeared = await browser
          .waitForElementByCss('[data-testid="schedule-content"]', 10000)
          .then(() => true)
          .catch(() => false)
        if (!appeared) {
          dropped++
          break
        }
      }
      require('console').log(
        `[sd86151] dropped=${dropped} of up to ${iterations}`
      )
      expect(dropped).toBe(0)
    }, 240000)
  } else {
    it.skip('runs in next start mode only', () => {})
  }
})
