import { nextTestSetup } from 'e2e-utils'

describe('next-dist-client-esm-import', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
  })

  it('should resolve ESM modules that have "next/dist/client" in their filename', async () => {
    // The filename for the client component module that's imported in this
    // fixture is: <node_modules>/@monorepo/adapter-next/dist/client/index.js
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
