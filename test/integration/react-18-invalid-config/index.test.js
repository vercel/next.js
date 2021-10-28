/* eslint-env jest */

import { join } from 'path'
import { File, nextBuild } from 'next-test-utils'

const appDir = __dirname
const nextConfig = new File(join(appDir, 'next.config.js'))

describe('Invalid react 18 webpack config', () => {
  it('should enable `experimental.reactRoot` when `experimental.concurrentFeatures` enables', async () => {
    nextConfig.replace('reactRoot: true', 'reactRoot: false')
    nextConfig.replace('serverComponents: true', 'serverComponents: false')
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    nextConfig.restore()

    expect(stderr).toContain(
      'Flag `experimental.concurrentFeatures` requires install React 18 or enable `experimental.reactRoot`.'
    )
  })

  it('should enable `experimental.concurrentFeatures` for server components', async () => {
    nextConfig.replace('concurrentFeatures: true', 'concurrentFeatures: false')
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    nextConfig.restore()

    expect(stderr).toContain(
      'Flag `experimental.concurrentFeatures` is required to be enabled along with `experimental.serverComponents`.'
    )
  })
})
