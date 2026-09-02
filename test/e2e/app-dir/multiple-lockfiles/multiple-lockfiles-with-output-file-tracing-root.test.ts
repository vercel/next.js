import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('multiple-lockfiles - has-output-file-tracing-root', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      // This will silence the multiple lockfiles warning.
      'next.config.js': `module.exports = { outputFileTracingRoot: __dirname }`,
      // Write a package-lock.json file to the parent directory to simulate
      // multiple lockfiles.
      '../package.json': JSON.stringify({
        name: 'parent-workspace',
        version: '1.0.0',
      }),
      '../package-lock.json': JSON.stringify({
        name: 'parent-workspace',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: { '': { name: 'parent-workspace', version: '1.0.0' } },
      }),
    },
    // So that ../package-lock.json doesn't leave the isolated testDir
    subDir: 'test',
    // The workspace file would suppress the warning itself, so the test
    // wouldn't be exercising `outputFileTracingRoot`.
    deleteWorkspaceFile: true,
  })

  it('should not have multiple lockfiles warnings', async () => {
    expect(next.cliOutput).not.toMatch(
      /We detected multiple lockfiles and selected the directory of .+ as the root directory\./
    )
  })
})
