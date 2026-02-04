import { nextBuild } from 'next-test-utils'
// In order for the global isNextStart to be set
import 'e2e-utils'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('ppr build errors', () => {
  ;(Boolean((global as any).isNextStart) ? describe : describe.skip)(
    'production only',
    () => {
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
    }
  )
})
