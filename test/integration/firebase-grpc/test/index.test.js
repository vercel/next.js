/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

describe('Building Firebase', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    // TODO: investigate re-enabling this test in node 12 environment
    it.skip('Throws an error when building with firebase dependency with worker_threads', async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { experimental: { workerThreads: true } }`
      )
      const results = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      expect(results.stdout + results.stderr).toMatch(/Build error occurred/)
      expect(results.stdout + results.stderr).toMatch(
        /grpc_node\.node\. Module did not self-register\./
      )
    })

    it('Throws no error when building with firebase dependency without worker_threads', async () => {
      await fs.remove(nextConfig)
      const results = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      expect(results.stdout + results.stderr).not.toMatch(
        /Build error occurred/
      )
      expect(results.stdout + results.stderr).not.toMatch(
        /grpc_node\.node\. Module did not self-register\./
      )
    })
  })
})
