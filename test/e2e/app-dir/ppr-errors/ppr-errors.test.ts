import { nextBuild } from 'next-test-utils'

describe('ppr build errors', () => {
  it('should fail the build with error messages', async () => {
    const out = await nextBuild(__dirname, [], { stderr: true })

    expect(out.stderr).toContain(
      'Postpone signal was caught while rendering /. Check to see if you\'re try/catching a Next.js API such as headers / cookies, or a fetch with "no-store".'
    )

    // in the case of catching a postpone and throwing a new error, we log the error that the user threw to help with debugging
    expect(out.stderr).toContain(
      'Postpone signal was caught while rendering /re-throwing-error. Check to see if you\'re try/catching a Next.js API such as headers / cookies, or a fetch with "no-store".'
    )
    expect(out.stderr).toContain(
      'The following error was thrown during build, and may help identify the source of the issue:'
    )
    expect(out.stderr).toContain(
      'Error: The original error was caught and rethrown.'
    )

    // the regular pre-render error should not be thrown as well, as we've already logged a more specific error
    expect(out.stderr).not.toContain('Error occurred prerendering page')
  })
})
