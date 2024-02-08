import { createNextDescribe } from 'e2e-utils'
import { packageList } from './package-list'
import { normalizePackageName } from './generate-helpers'

jest.setTimeout(60 * 1000 * 10)

createNextDescribe(
  'ecosystem-packages',
  {
    files: __dirname,
    dependencies: require('./package.json').dependencies,
  },
  ({ next }) => {
    for (const packageName of packageList) {
      const normalizedPackageName = normalizePackageName(packageName)
      it(`should render with ${packageName}`, async () => {
        const url = `/list/${normalizedPackageName}`
        // Browser has an early timeout, this ensures the page is fully compiled when the browser is loaded, disregarding the 60 second timeout that is hit for large packages
        await next.fetch(url)
        const browser = await next.browser(url)
        expect(await browser.elementByCss('h1').text()).toBe('Hello World')
      })
    }
  }
)
