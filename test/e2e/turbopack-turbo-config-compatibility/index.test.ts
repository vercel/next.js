/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-turbo-config-compatibility',
  () => {
    describe('including both turbopack and deprecated experimental turbo config', () => {
      const { next } = nextTestSetup({
        files: __dirname,
      })

      it('prefers turbopack config over deprecated experimental turbo config', async () => {
        const $ = await next.render$('/')
        expect($('#result').text()).toEqual('Hello turbopack')
      })
    })

    describe('only including deprecated experimental turbo config', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        overrideFiles: {
          'next.config.js': `module.exports = {
          experimental: {
            turbo: {
              resolveAlias: {
                foo: './turbo.js',
              },
            },
          },
        }`,
        },
      })

      it('still uses the deprecated experimental turbo config', async () => {
        const $ = await next.render$('/')
        expect($('#result').text()).toEqual('Hello turbo')
      })
    })
  }
)
