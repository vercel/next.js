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
  it('should enable `experimental.reactRoot` when `experimental.runtime` is enabled', async () => {
    writeNextConfig({
      runtime: 'edge',
    })
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    nextConfig.restore()

    expect(stderr).toContain(
      '`experimental.runtime` requires `experimental.reactRoot` to be enabled along with React 18.'
    )
  })
})

describe('React 17 with React 18 config', () => {
  beforeAll(() => {
    const reactDomPackagePah = join(appDir, 'node_modules/react-dom')
    await fs.mkdirp(reactDomPackagePah)
    await fs.writeFile(
      join(reactDomPackagePah, 'package.json'),
      JSON.stringify({ name: 'react-dom', version: '17.0.0' })
    )
    writeNextConfig({ reactRoot: true })
  })
  afterAll(() => {
    await fs.remove(reactDomPackagePah)
    nextConfig.restore()
  })

  it('should warn user when not using react 18 and `experimental.reactRoot` is enabled', async () => {
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toContain(
      'You have to use React 18 to use `experimental.reactRoot`.'
    )
  })

  test('suspense is not allowed in blocking rendering mode', async () => {
    const { stderr, code } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain(
      'Invalid suspense option usage in next/dynamic. Read more: https://nextjs.org/docs/messages/invalid-dynamic-suspense'
    )
    expect(code).toBe(1)
  })
})
