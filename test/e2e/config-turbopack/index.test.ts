/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

const WARNING_MESSAGE = `ERROR: This build is using Turbopack, with a \`webpack\` config and no \`turbopack\` config.`

const itif = (condition: boolean) => (condition ? it : it.skip)

const page = {
  'app/page.js': `
export default function Page() {
  return <p>hello world</p>
}
`,
}

;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'config-turbopack',
  () => {
    describe('when turbopack is auto selected', () => {
      describe('when webpack is configured but Turbopack is not', () => {
        const { next, isNextDev, isNextStart } = nextTestSetup({
          skipStart: Boolean(process.env.NEXT_TEST_MODE === 'start'),
          turbo: false,
          env: {
            TURBOPACK: 'auto',
          },
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

        itif(isNextDev)('warns', async () => {
          if (next)
            try {
              await next.render('/')
            } catch (e) {
              // we expect an error but this is the only way to get the server to crash
            }

          expect(next.cliOutput).toContain(WARNING_MESSAGE)
        })
        itif(isNextStart)('errors', async () => {
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
        const { next } = nextTestSetup({
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

        it('does not warn', async () => {
          if (next) await next.render('/')
          expect(next.cliOutput).not.toContain(WARNING_MESSAGE)
        })
      })
      noWarnCases()
    })
    /// These other cases don't warn because --turbopack is explicitly selected
    function noWarnCases(env?: Record<string, string>) {
      describe('when webpack is configured and config.turbopack is set', () => {
        const { next } = nextTestSetup({
          env,
          files: {
            ...page,
            'next.config.js': `
            module.exports = {
              turbopack: {
               
              },
              webpack: (config) => {
                return config
              },
            }
          `,
          },
        })

        it('does not warn', async () => {
          if (next) await next.render('/')
          expect(next.cliOutput).not.toContain(WARNING_MESSAGE)
        })
      })

      describe('when webpack is configured and config.experimental.turbo is set', () => {
        const { next } = nextTestSetup({
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

        it('does not warn', async () => {
          if (next) await next.render('/')
          expect(next.cliOutput).not.toContain(WARNING_MESSAGE)
        })
      })
    }
  }
)
