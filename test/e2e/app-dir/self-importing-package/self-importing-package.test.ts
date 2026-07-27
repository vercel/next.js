import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('self-importing-package', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // This test is skipped when deployed because the local tarball appears corrupted
    // It also doesn't seem particularly useful to test when deployed
    skipDeployment: true,
    dependencies: {
      'internal-pkg': `file:${path.join(__dirname, 'internal-pkg.tar')}`,
    },
  })

  it('should resolve self-imports in an external package', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('test abc')
  })
})
