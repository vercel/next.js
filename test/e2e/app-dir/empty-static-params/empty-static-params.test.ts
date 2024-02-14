import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'empty-static-params',
  {
    files: __dirname,
  },
  () => {
    // Runs a dummy test to ensure the test suite has built while working around the fact that `next start` does not work with exports
    it('should have built', async () => {})
  }
)
