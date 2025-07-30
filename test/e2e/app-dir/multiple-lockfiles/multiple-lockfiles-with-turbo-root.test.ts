import { join } from 'path'
import { unlink } from 'fs/promises'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('multiple-lockfiles - has-turbo-root', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      // This will silence the multiple lockfiles warning.
      'next.config.js': `module.exports = { turbopack: { root: __dirname } }`,
      // Write a package-lock.json file to the parent directory to simulate
      // multiple lockfiles.
      '../package-lock.json': JSON.stringify({
        name: 'parent-workspace',
        version: '1.0.0',
        lockfileVersion: 3,
      }),
    },
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  afterAll(async () => {
    // Cleanup to ensure it doesn't affect other tests.
    await unlink(join(next.testDir, '../package-lock.json'))
  })

  it('should not have multiple lockfiles warnings', async () => {
    expect(next.cliOutput).not.toMatch(
      /We detected multiple lockfiles and selected the directory of .+ as the root directory\./
    )
  })
})
