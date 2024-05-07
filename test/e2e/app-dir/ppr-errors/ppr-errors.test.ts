import { nextBuild } from 'next-test-utils'

describe('ppr build errors', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    let stderr: string
    let stdout: string

    beforeAll(async () => {
      const output = await nextBuild(__dirname, [], {
        stderr: true,
        stdout: true,
      })
      stderr = output.stderr
      stdout = output.stdout
    })

    describe('within a suspense boundary', () => {
      it('should fail the build for uncaught prerender errors', async () => {
        expect(stderr).toContain(
          'Error occurred prerendering page "/regular-error-suspense-boundary".'
        )
        expect(stderr).toContain(
          'Error occurred prerendering page "/re-throwing-error".'
        )
      })
    })

    describe('outside of a suspense boundary', () => {
      it('should fail the build for uncaught errors', async () => {
        expect(stderr).toContain(
          'Error occurred prerendering page "/regular-error".'
        )
        expect(stderr).toContain(
          'Error occurred prerendering page "/no-suspense-boundary-re-throwing-error".'
        )
      })
    })

    describe('when a postpone call is caught and logged it should', () => {
      it('should include a message telling why', async () => {
        expect(stdout).toContain(
          'User land logged error: Route /logging-error needs to bail out of prerendering at this point because it used cookies.'
        )
      })
    })
  })
})
