import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const webpackVersions = ['5.98.0', '5.111.0']

for (const webpackVersion of webpackVersions) {
  // @force-gate webpack
  describe(`experimental.customWebpack with webpack ${webpackVersion}`, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        webpack: webpackVersion,
      },
      env: {
        CUSTOM_WEBPACK: 'true',
        EXPECTED_WEBPACK_VERSION: webpackVersion,
      },
    })

    it('uses the project webpack and renders successfully', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe(`webpack ${webpackVersion}`)
    })
  })
}

// @force-gate webpack
describe('experimental.customWebpack without a webpack dependency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {},
    env: {
      CUSTOM_WEBPACK: 'true',
    },
    skipStart: true,
  })

  it('reports how to install webpack', async () => {
    await next.start().catch(() => {})
    await retry(() => {
      expect(next.cliOutput).toContain(
        '`experimental.customWebpack` requires webpack to be installed in your project'
      )
    })
  })
})

// @force-gate webpack
describe('without experimental.customWebpack', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {},
  })

  it('uses bundled webpack without requiring the peer dependency', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('webpack bundled')
  })
})
