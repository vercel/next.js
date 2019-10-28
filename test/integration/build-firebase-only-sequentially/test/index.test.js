/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

describe('Builds with firebase dependency only sequentially', () => {
  it('Throws an error when building with firebase dependency in parallel', async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { experimental: { cpus: 2 } }`
    )
    const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
    expect(results.stdout + results.stderr).toMatch(/Build error occurred/)
    expect(results.stdout + results.stderr).toMatch(
      /grpc_node\.node\. Module did not self-register\./
    )
    await fs.remove(nextConfig)
  })

  it('Throws no error when building with firebase dependency in sequence', async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { experimental: { cpus: 1 } }`
    )
    const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
    expect(results.stdout + results.stderr).not.toMatch(/Build error occurred/)
    expect(results.stdout + results.stderr).not.toMatch(
      /grpc_node\.node\. Module did not self-register\./
    )
    await fs.remove(nextConfig)
  })
})
