/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { File, nextBuild } from 'next-test-utils'

const appDir = __dirname
const nextConfig = new File(join(appDir, 'next.config.js'))

function writeNextConfig(config) {
  const content = `module.exports = { experimental: ${JSON.stringify(config)} }`
  nextConfig.write(content)
}

describe('Invalid react 18 webpack config', () => {
  it('should enable `experimental.reactRoot` when `experimental.concurrentFeatures` enables', async () => {
    writeNextConfig({
      concurrentFeatures: true,
    })
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    nextConfig.restore()

    expect(stderr).toContain(
      '`experimental.concurrentFeatures` requires `experimental.reactRoot` to be enabled along with React 18.'
    )
  })

  it('should enable `experimental.concurrentFeatures` for server components', async () => {
    writeNextConfig({
      reactRoot: true,
      concurrentFeatures: false,
      serverComponents: true,
    })
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    nextConfig.restore()

    expect(stderr).toContain(
      '`experimental.concurrentFeatures` is required to be enabled along with `experimental.serverComponents`.'
    )
  })

  it('should warn user when not using react 18 and `experimental.reactRoot` is enabled', async () => {
    const reactDomPackagePah = join(appDir, 'node_modules/react-dom')
    await fs.mkdirp(reactDomPackagePah)
    await fs.writeFile(
      join(reactDomPackagePah, 'package.json'),
      JSON.stringify({ name: 'react-dom', version: '17.0.0' })
    )
    writeNextConfig({ reactRoot: true })
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    await fs.remove(reactDomPackagePah)
    nextConfig.restore()

    expect(stderr).toContain(
      'You have to use React 18 to use `experimental.reactRoot`.'
    )
  })
})
