/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { File, nextBuild } from 'next-test-utils'

const appDir = __dirname
const nodeArgs = ['-r', join(appDir, '../../lib/react-channel-require-hook.js')]
const reactDomPackagePah = join(appDir, 'node_modules/react-dom')
const nextConfig = new File(join(appDir, 'next.config.js'))

function writeNextConfig(config) {
  const content = `
    module.exports = { experimental: ${JSON.stringify(config)} }
  `
  nextConfig.write(content)
}

describe('Invalid react 18 webpack config', () => {
  it('should install react 18 when `experimental.runtime` is enabled', async () => {
    writeNextConfig({
      runtime: 'experimental-edge',
    })
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      nodeArgs,
      env: { __NEXT_REACT_CHANNEL: '17' },
    })
    nextConfig.restore()

    expect(stderr).toContain(
      '`experimental.runtime` requires React 18 to be installed.'
    )
  })
})

describe('React 17 with React 18 config', () => {
  beforeAll(async () => {
    await fs.mkdirp(reactDomPackagePah)
    await fs.writeFile(
      join(reactDomPackagePah, 'package.json'),
      JSON.stringify({ name: 'react-dom', version: '17.0.0' })
    )
    writeNextConfig({})
  })
  afterAll(async () => {
    await fs.remove(reactDomPackagePah)
    nextConfig.restore()
  })

  it('suspense is not allowed in blocking rendering mode', async () => {
    const { stderr, code } = await nextBuild(appDir, [], {
      stderr: true,
      nodeArgs,
      env: {
        __NEXT_REACT_CHANNEL: '17',
      },
    })
    expect(stderr).toContain(
      'Invalid suspense option usage in next/dynamic. Read more: https://nextjs.org/docs/messages/invalid-dynamic-suspense'
    )
    expect(code).toBe(1)
  })
})
