import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'parallel-routes-and-interception',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should render the default sidebar slot on the / page', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementById('sidebar').text()).toMatch(
        'Sidebar Default Slot'
      )
    })

    it('should render the dynamic default sidebar slot on the /dynamic page', async () => {
      const browser = await next.browser('/dynamic')
      expect(await browser.elementById('sidebar').text()).toMatch(
        'Sidebar Dynamic Slot'
      )
    })

    it('should render the default sidebar slot on the /dynamic/1 page', async () => {
      const browser = await next.browser('/dynamic/1')
      expect(await browser.elementById('sidebar').text()).toMatch(
        'Sidebar Dynamic Slot'
      )
    })

    it('should favor the page slot if it exists', async () => {
      let browser = await next.browser('/dynamic2/1')
      expect(await browser.elementById('sidebar').text()).toMatch(
        'Sidebar Dynamic2/[id] Slot'
      )

      // should still support the default slot if the page slot is not present in the segment above
      browser = await next.browser('/dynamic2')
      expect(await browser.elementById('sidebar').text()).toMatch(
        'Sidebar Dynamic2 Default Slot'
      )
    })
  }
)
