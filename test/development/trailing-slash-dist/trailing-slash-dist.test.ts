import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { getPageFileFromBuildManifest } from 'next-test-utils'

describe('trailing-slash-dist', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('supports trailing slash in distDir', async () => {
    // Make sure the page is rendered before getting the file
    await next.render('/')
    const file = getPageFileFromBuildManifest(next.testDir, '/')
    const res = await next.fetch(join('/_next', file))
    expect(res.status).toBe(200)
  })
})
