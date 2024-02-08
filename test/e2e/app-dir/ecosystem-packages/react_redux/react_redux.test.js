import { createNextDescribe } from 'e2e-utils'
const packageName = 'react-redux'
const normalizedPackageName = 'react_redux'

jest.setTimeout(60 * 1000 * 10)

createNextDescribe(
  `ecosystem-packages ${packageName}`,
  {
    files: __dirname,
    dependencies: {
      [packageName]: '*',
    },
  },
  ({ next }) => {
    it(`should render in client component`, async () => {
      const url = `/client-components/${normalizedPackageName}`
      // Browser has an early timeout, this ensures the page is fully compiled when the browser is loaded, disregarding the 60 second timeout that is hit for large packages
      await next.fetch(url)
      const browser = await next.browser(url)
      expect(await browser.elementByCss('h1').text()).toBe('Hello World')
    })

    it(`should render in server component`, async () => {
      const url = `/server-components/${normalizedPackageName}`
      // Browser has an early timeout, this ensures the page is fully compiled when the browser is loaded, disregarding the 60 second timeout that is hit for large packages
      await next.fetch(url)
      const browser = await next.browser(url)
      expect(await browser.elementByCss('h1').text()).toBe('Hello World')
    })
  }
)
