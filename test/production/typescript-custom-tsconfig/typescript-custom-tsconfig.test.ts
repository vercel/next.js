import { nextTestSetup } from 'e2e-utils'

const warnMessage = /Using tsconfig file:/

describe('Custom TypeScript Config', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode',
    () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        skipDeployment: true,
      })
      if (skipped) return

      it('should warn when using custom typescript path', async () => {
        await next.build()
        expect(next.cliOutput).toMatch(warnMessage)
      })
    }
  )
})
