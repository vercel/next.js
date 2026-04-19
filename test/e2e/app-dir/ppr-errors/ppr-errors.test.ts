import { isNextStart, nextTestSetup } from 'e2e-utils'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('ppr build errors', () => {
  ;(isNextStart ? describe : describe.skip)('production only', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    let cliOutput: string

    beforeAll(async () => {
      const output = await next.build()
      cliOutput = output.cliOutput
    })

    describe('within a suspense boundary', () => {
      it('should fail the build for uncaught prerender errors', async () => {
        expect(cliOutput).toContain(
          'Error occurred prerendering page "/regular-error-suspense-boundary".'
        )
        expect(cliOutput).toContain(
          'Error occurred prerendering page "/re-throwing-error".'
        )
      })
    })

    describe('outside of a suspense boundary', () => {
      it('should fail the build for uncaught errors', async () => {
        expect(cliOutput).toContain(
          'Error occurred prerendering page "/regular-error".'
        )
        expect(cliOutput).toContain(
          'Error occurred prerendering page "/no-suspense-boundary-re-throwing-error".'
        )
      })
    })

    describe('when a postpone call is caught and logged it should', () => {
      it('should include a message telling why', async () => {
        expect(cliOutput).toContain(
          'User land logged error: Route /logging-error needs to bail out of prerendering at this point because it used cookies.'
        )
      })
    })
  })
})
