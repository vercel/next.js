import { nextTestSetup } from 'e2e-utils'
import { buildTS } from 'next-test-utils'

describe('Custom Server TypeScript', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should build server.ts correctly', async () => {
    await buildTS([], next.testDir)
  })
})
