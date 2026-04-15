import { nextTestSetup } from 'e2e-utils'

const warnMessage = /Using tsconfig file:/

;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Custom TypeScript Config',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const { next } = nextTestSetup({
          files: __dirname,
          skipStart: true,
        })

        it('should warn when using custom typescript path', async () => {
          await next.build()
          expect(next.cliOutput).toMatch(warnMessage)
        })
      }
    )
  }
)
