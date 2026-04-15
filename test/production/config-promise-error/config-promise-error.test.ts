import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Promise in next config',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const { next } = nextTestSetup({
          files: __dirname,
          skipStart: true,
        })

        it('should warn when a promise is returned on webpack', async () => {
          await next.patchFile(
            'next.config.js',
            `
      module.exports = (phase, { isServer }) => {
        return {
          webpack: async (config) => {
            return config
          }
        }
      }
    `
          )

          await next.build()
          expect(next.cliOutput).toMatch(
            /> Promise returned in next config\. https:\/\//
          )
        })
      }
    )
  }
)
