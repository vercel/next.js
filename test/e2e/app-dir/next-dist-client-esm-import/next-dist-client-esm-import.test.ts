import { nextTestSetup } from 'e2e-utils'

describe('next-dist-client-esm-import', () => {
  const dependencies = require('./package.json').dependencies

  if ((global as any).isNextDeploy) {
    // The `link:` protocol is incompatible with the npm version that's used
    // when this test is deployed, so we use `file:` instead.
    dependencies['@monorepo/adapter-next'] = 'file:./adapter-next'
  }

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies,
  })

  it('should resolve ESM modules that have "next/dist/client" in their filename', async () => {
    // The filename for the client component module that's imported in this
    // fixture is: <node_modules>/@monorepo/adapter-next/dist/client/index.js
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
