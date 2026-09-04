import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('conflicting-page-segments', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    // we skip start & deploy because the build will fail and we won't be able to catch it
    // start is re-triggered but caught in the assertions below.
    skipStart: true,
  })

  it('should throw an error when a route groups causes a conflict with a parallel segment', async () => {
    if (isNextDev) {
      await next.start()
      const html = await next.render('/')

      expect(html).toContain(
        'You cannot have two parallel pages that resolve to the same path.'
      )
    } else {
      await expect(next.start()).rejects.toThrow('next build failed')

      await retry(() => {
        expect(next.cliOutput).toMatch(
          /You cannot have two parallel pages that resolve to the same path\. Please check \/\(group-a\)(\/page)? and \/\(group-b\)(\/page)?\./i
        )
      })
    }
  })
})
