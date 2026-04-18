import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Production Usage without production build', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isNextStart) {
    it('skipped for non-start mode', () => {})
    return
  }

  it('should show error when there is no production build', async () => {
    await next.start({ skipBuild: true }).catch(() => {})
    await retry(async () => {
      expect(next.cliOutput).toMatch(/Could not find a production build in the/)
    })
  })
})
