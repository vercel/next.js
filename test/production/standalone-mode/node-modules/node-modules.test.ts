import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - NFT in node_modules', () => {
  const dependencies = require('./package.json').dependencies

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not trace process.cwd calls in node_modules', async () => {
    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    expect(trace.files).toContain('../../../app/static-from-app.txt')
    expect(trace.files).not.toContain('../../../app/static-from-pkg.txt')
  })
})
