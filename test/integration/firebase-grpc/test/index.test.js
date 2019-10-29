/* global fixture, test */
import 'testcafe'

import path from 'path'
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

fixture('Building Firebase')

// TODO: investigate re-enabling this test in node 12 environment
// test('Throws an error when building with firebase dependency with worker_threads', async t => {
//   await fs.writeFile(
//     nextConfig,
//     `module.exports = { experimental: { workerThreads: true } }`
//   )
//   const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
//   await t.expect(results.stdout + results.stderr).match(/Build error occurred/)
//   await t.expect(results.stdout + results.stderr).match(
//     /grpc_node\.node\. Module did not self-register\./
//   )
// })

test('Throws no error when building with firebase dependency without worker_threads', async t => {
  await fs.remove(nextConfig)
  const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
  await t
    .expect(results.stdout + results.stderr)
    .notMatch(/Build error occurred/)
  await t
    .expect(results.stdout + results.stderr)
    .notMatch(/grpc_node\.node\. Module did not self-register\./)
})
