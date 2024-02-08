import { createNextDescribe } from 'e2e-utils'
import { normalizePackageName } from './generate-helpers'
import { entrypointMapping } from './package-list'

function ecosystemPackageTest(packageName) {
  const normalizedPackageName = normalizePackageName(packageName)

  jest.setTimeout(60 * 1000 * 10)

  createNextDescribe(
    `ecosystem-packages ${packageName}`,
    {
      files: {
        [`app/server-components/${normalizedPackageName}/page.js`]: `
import * as ${normalizedPackageName} from '${
          entrypointMapping[packageName] || packageName
        }'
console.log(${normalizedPackageName})

export default function Page() {
  return <h1>Hello World</h1>
}`,
        [`app/client-components/${normalizedPackageName}/page.js`]: `"use client"
import * as ${normalizedPackageName} from '${
          entrypointMapping[packageName] || packageName
        }'
console.log(${normalizedPackageName})

export default function Page() {
    return <h1>Hello World</h1>
}`,
        'app/layout.js': `export default function Root({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}`,
      },
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
}

module.exports = {
  ecosystemPackageTest,
}
