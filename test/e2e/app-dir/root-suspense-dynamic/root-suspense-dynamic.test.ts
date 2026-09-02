import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('Root Suspense Dynamic Rendering', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname + '/fixtures/default',
  })

  // TODO: remove when there is a test for isNextDev === false
  it('placeholder to satisfy at least one test when isNextDev is false', async () => {
    expect(true).toBe(true)
  })

  if (isNextStart) {
    it('should handle dynamic content wrapped in Suspense above HTML structure', async () => {
      try {
        // Should render the page successfully
        const $ = await next.render$('/')
        expect($('body').text()).toContain('Hello World')
      } catch (error) {
        throw new Error(
          'Expected build to succeed for Suspense wrapping dynamic content above HTML',
          { cause: error }
        )
      }
    })

    it('should correctly mark route as dynamic', async () => {
      // The route should be marked as dynamic (ƒ) not static (○)
      expect(next.cliOutput).toContain('ƒ /')
    })
  }
})
