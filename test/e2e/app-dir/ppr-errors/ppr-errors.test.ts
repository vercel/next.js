import { nextBuild } from 'next-test-utils'

describe('ppr build errors', () => {
  let stderr: string

  beforeAll(async () => {
    stderr = (await nextBuild(__dirname, [], { stderr: true })).stderr
  })

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
      'Error occurred prerendering page /no-suspense-boundary'
    )
    expect(stderr).not.toContain(
      'Error occurred prerendering page /re-throwing-error'
    )
  })

  it('should fail the build with a regular prerender error for errors thrown during static generation', async () => {
    expect(stderr).toContain(
      'Error occurred prerendering page "/regular-error".'
    )
  })
})
