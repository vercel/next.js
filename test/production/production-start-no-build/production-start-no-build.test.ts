import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
// @force-gate !deploy
describe('Production Usage without production build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should show error when there is no production build', async () => {
    await next.start({ skipBuild: true }).catch(() => {})
    await retry(async () => {
      expect(next.cliOutput).toMatch(/Could not find a production build in the/)
    })
  })
})
