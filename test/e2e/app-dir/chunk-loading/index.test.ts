import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir build size',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
    it('creates a sandbox', async () => {
      return
    })
  }
)
