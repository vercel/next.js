import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'parallel-route-not-found',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    it('should handle a layout that attempts to render a missing parallel route', async () => {
      const browser = await next.browser('/no-bar-slot')
      const logs = await browser.log()
      expect(await browser.elementByCss('body').text()).toContain(
        'This page could not be found'
      )
      const warnings = logs.filter((log) => log.source === 'warning')
      if (isNextDev) {
        expect(warnings.length).toBe(1)
        expect(warnings[0].message).toContain(
          'No default component was found for a parallel route rendered on this page'
        )
        expect(warnings[0].message).toContain('Missing slots: @bar')
      } else {
        expect(warnings.length).toBe(0)
      }
    })

    it('should handle multiple missing parallel routes', async () => {
      const browser = await next.browser('/both-slots-missing')
      const logs = await browser.log()

      expect(await browser.elementByCss('body').text()).toContain(
        'This page could not be found'
      )

      const warnings = logs.filter((log) => log.source === 'warning')
      if (isNextDev) {
        expect(warnings.length).toBe(1)
        expect(warnings[0].message).toContain(
          'No default component was found for a parallel route rendered on this page'
        )
        expect(warnings[0].message).toContain('Missing slots: @bar, @foo')
      } else {
        expect(warnings.length).toBe(0)
      }
    })

    it('should render the page & slots if all parallel routes are found', async () => {
      const browser = await next.browser('/has-both-slots')
      const logs = await browser.log()

      expect(await browser.elementByCss('body').text()).toContain(
        'Has Both Slots'
      )
      expect(await browser.elementByCss('body').text()).toContain('@foo slot')
      expect(await browser.elementByCss('body').text()).toContain('@bar slot')

      const warnings = logs.filter((log) => log.source === 'warning')
      expect(warnings.length).toBe(0)
    })

    if (isNextDev) {
      it('should not log any warnings for a regular not found page', async () => {
        const browser = await next.browser('/this-page-doesnt-exist')
        const logs = await browser.log()
        expect(await browser.elementByCss('body').text()).toContain(
          'This page could not be found'
        )
        const warnings = logs.filter((log) => log.source === 'warning')
        expect(warnings.length).toBe(0)
      })
    }
  }
)
