/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

const WARNING_MESSAGE = 'Webpack is configured while Turbopack is not'

const itif = (condition: boolean) => (condition ? it : it.skip)

describe('config-turbopack', () => {
  describe('when webpack is configured but Turbopack is not', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: {
        'app/page.js': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
        'next.config.js': `
          module.exports = {
            webpack: (config) => {
              return config
            },
          }
        `,
      },
    })

    itif(isTurbopack)('warns', async () => {
      if (next) await next.render('/')
      expect(next.cliOutput).toContain(WARNING_MESSAGE)
    })
  })

  describe('when webpack is configured and config.turbopack is set', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: {
        'app/page.js': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
        'next.config.js': `
          module.exports = {
            turbopack: {
              rules: {
                '*.foo': {
                  loaders: ['foo-loader']
                }
              }
            },
            webpack: (config) => {
              return config
            },
          }
        `,
      },
    })

    itif(isTurbopack)('does not warn', async () => {
      if (next) await next.render('/')
      expect(next.cliOutput).not.toContain(WARNING_MESSAGE)
    })
  })

  describe('when webpack is configured and config.experimental.turbo is set', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: {
        'app/page.js': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
        'next.config.js': `
          module.exports = {
            experimental: {
              turbo: {
                rules: {
                  '*.foo': {
                    loaders: ['foo-loader']
                  }
                }
              }
            },
            webpack: (config) => {
              return config
            },
          }
        `,
      },
    })

    itif(isTurbopack)('does not warn', async () => {
      if (next) await next.render('/')
      expect(next.cliOutput).not.toContain(WARNING_MESSAGE)
    })
  })
})
