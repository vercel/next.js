/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

const WARNING_MESSAGE = 'Webpack is configured while Turbopack is not'

const itif = (condition: boolean) => (condition ? it : it.skip)

const page = {
  'app/page.js': `
export default function Page() {
  return <p>hello world</p>
}
`,
}

const TURBOPACK_FLAG = process.env.TURBOPACK
describe('config-turbopack', () => {
  describe('when turbopack is auto selected', () => {
    if (process.env.IS_TURBOPACK_TEST) {
      beforeAll(() => {
        // This is hacky since it isn't a public API, but it's the only way to test this.
        // If next started ignoring IS_TURBOPACK_TEST we could possibly change nextTestSetup to not set the turbopack flag.
        process.env.TURBOPACK = 'auto'
      })
      afterAll(() => {
        if (TURBOPACK_FLAG) {
          process.env.TURBOPACK = TURBOPACK_FLAG
        } else {
          delete process.env.TURBOPACK
        }
      })
    }
    describe('when webpack is configured but Turbopack is not', () => {
      const { next, isTurbopack, isNextDev, isNextStart } = nextTestSetup({
        skipStart: Boolean(process.env.TURBOPACK_BUILD),
        turbo: false,
        files: {
          ...page,
          'next.config.js': `
          module.exports = {
            webpack: (config) => {
              return config
            },
          }
        `,
        },
      })

      itif(isTurbopack && isNextDev)('warns', async () => {
        if (next) await next.render('/')
        expect(next.cliOutput).toContain(WARNING_MESSAGE)
      })
      itif(isTurbopack && isNextStart)('errors', async () => {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(WARNING_MESSAGE)
      })
    })
    // no warn cases work when auto selected too
    noWarnCases()
  })

  describe('when turbopack is explicitly configured', () => {
    describe('when webpack is configured but Turbopack is not', () => {
      const { next, isTurbopack } = nextTestSetup({
        files: {
          ...page,
          'next.config.js': `
            module.exports = {
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
    noWarnCases()
  })
  /// These other cases don't warn because --turbopack is explicitly selected
  function noWarnCases() {
    describe('when webpack is configured and config.turbopack is set', () => {
      const { next, isTurbopack } = nextTestSetup({
        files: {
          ...page,
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
          ...page,
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
  }
})
