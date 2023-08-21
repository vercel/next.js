import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('webpack config with extensionAlias setting', () => {
  it('should run correctly with an tsx file import with .js extension', async () => {
    const { code } = await nextBuild(appDir, [], {})

    expect(code).toBe(0)
  })
})
