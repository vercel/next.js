import { nextBuild } from 'next-test-utils'

describe('ppr build errors', () => {
  let stderr: string

  beforeAll(async () => {
    stderr = (await nextBuild(__dirname, [], { stderr: true })).stderr
  })

  describe('within a suspense boundary', () => {
    it('should fail the build when catching a call to postpone', async () => {
      expect(stderr).toContain(
        'Postpone signal was caught while rendering /. Check to see if you\'re try/catching a Next.js API such as headers / cookies, or a fetch with "no-store".'
      )
    })

    it('should fail the build when catching a call to postpone & rethrowing an error', async () => {
      // in the case of catching a postpone and throwing a new error, we log the error that the user threw to help with debugging
      expect(stderr).toContain(
        'Postpone signal was caught while rendering /re-throwing-error. Check to see if you\'re try/catching a Next.js API such as headers / cookies, or a fetch with "no-store".'
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

  describe('outside of a suspense boundary', () => {
    it('should fail the build when catching a call to postpone outside of a suspense boundary', async () => {
      expect(stderr).toContain(
        'Postpone signal was caught while rendering /no-suspense-boundary. Check to see if you\'re try/catching a Next.js API such as headers / cookies, or a fetch with "no-store".'
      )

      // the regular pre-render error should not be thrown as well, as we've already logged a more specific error
      expect(stderr).not.toContain(
        'Error occurred prerendering page "/no-suspense-boundary"'
      )
    })

    it('should fail the build when catching a call to postpone & rethrowing an error', async () => {
      // in the case of catching a postpone and throwing a new error, we log the error that the user threw to help with debugging
      expect(stderr).toContain(
        'Postpone signal was caught while rendering /no-suspense-boundary-re-throwing-error. Check to see if you\'re try/catching a Next.js API such as headers / cookies, or a fetch with "no-store".'
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

  describe('regular prerender errors', () => {
    it('should fail the build for uncaught errors', async () => {
      expect(stderr).toContain(
        'Error occurred prerendering page "/regular-error".'
      )
    })
  })
})
