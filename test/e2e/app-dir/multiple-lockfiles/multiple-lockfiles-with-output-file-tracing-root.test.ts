import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('multiple-lockfiles - has-output-file-tracing-root', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      // This will silence the multiple lockfiles warning.
      'next.config.js': `module.exports = { outputFileTracingRoot: __dirname }`,
      // Write a package-lock.json file to the parent directory to simulate
      // multiple lockfiles.
      '../package-lock.json': JSON.stringify({
        name: 'parent-workspace',
        version: '1.0.0',
        lockfileVersion: 3,
      }),
    },
    // So that ../package-lock.json doesn't leave the isolated testDir
    subDir: 'test',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not have multiple lockfiles warnings', async () => {
    expect(next.cliOutput).not.toMatch(
      /We detected multiple lockfiles and selected the directory of .+ as the root directory\./
    )
  })
})
