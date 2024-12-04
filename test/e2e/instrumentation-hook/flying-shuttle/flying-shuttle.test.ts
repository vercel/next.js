import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('instrumentation-hook - flying-shuttle', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    await fs.remove('.next')
  })

  it('should only register without errors', async () => {
    await next.fetch('/')
    await next.fetch('/edge')

    await retry(() => {
      expect(next.cliOutput).toIncludeRepeated('register:edge', 1)
      expect(next.cliOutput).not.toContain(
        'An error occurred while loading instrumentation hook'
      )
      expect(next.cliOutput).toIncludeRepeated('register:nodejs', 1)
    })
  })
})
