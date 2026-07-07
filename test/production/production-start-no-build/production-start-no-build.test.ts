import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Production Usage without production build', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  it('should show error when there is no production build', async () => {
    await next.start({ skipBuild: true }).catch(() => {})
    await retry(async () => {
      expect(next.cliOutput).toMatch(/Could not find a production build in the/)
    })
  })
})
