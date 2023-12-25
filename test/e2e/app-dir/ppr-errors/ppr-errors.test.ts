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
      })

      describe('when a postpone call was made but missing postpone data', () => {
        it('should fail the build', async () => {
          expect(stderr).toContain(
            'Prerendering / needs to partially bail out because something dynamic was used. '
          )
        })

        it('should fail the build & surface any errors that were thrown by user code', async () => {
          // in the case of catching a postpone and throwing a new error, we log the error that the user threw to help with debugging
          expect(stderr).toContain(
            'Prerendering /re-throwing-error needs to partially bail out because something dynamic was used. '
          )
          expect(stderr).toContain(
            'The following error was thrown during build, and may help identify the source of the issue:'
          )
          expect(stderr).toContain(
            'Error: The original error was caught and rethrown.'
          )

          // the regular pre-render error should not be thrown as well, as we've already logged a more specific error
          expect(stderr).not.toContain(
            'Error occurred prerendering page "/re-throwing-error"'
          )
        })
      })
    })

    describe('outside of a suspense boundary', () => {
      it('should fail the build for uncaught errors', async () => {
        expect(stderr).toContain(
          'Error occurred prerendering page "/regular-error".'
        )
      })

      describe('when a postpone call was made but missing postpone data', () => {
        it('should fail the build', async () => {
          expect(stderr).toContain(
            'Prerendering /no-suspense-boundary needs to partially bail out because something dynamic was used. '
          )

          // the regular pre-render error should not be thrown as well, as we've already logged a more specific error
          expect(stderr).not.toContain(
            'Error occurred prerendering page "/no-suspense-boundary"'
          )
        })

        it('should fail the build & surface any errors that were thrown by user code', async () => {
          // in the case of catching a postpone and throwing a new error, we log the error that the user threw to help with debugging
          expect(stderr).toContain(
            'Prerendering /no-suspense-boundary-re-throwing-error needs to partially bail out because something dynamic was used. '
          )
          expect(stderr).toContain(
            'The following error was thrown during build, and may help identify the source of the issue:'
          )
          expect(stderr).toContain(
            "Error: Throwing a new error from 'no-suspense-boundary-re-throwing-error'"
          )

          // the regular pre-render error should not be thrown as well, as we've already logged a more specific error
          expect(stderr).not.toContain(
            'Error occurred prerendering page "/no-suspense-boundary-re-throwing-error"'
          )
        })
      })
    })

    describe('when a postpone call is caught and logged it should', () => {
      it('should include a message telling why', async () => {
        expect(stdout).toContain(
          'Logged error: This page needs to bail out of prerendering at this point because it used cookies.'
        )
      })
    })
  })
})
