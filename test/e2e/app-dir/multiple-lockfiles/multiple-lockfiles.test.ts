import { join } from 'path'
import { unlink } from 'fs/promises'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('multiple-lockfiles', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
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

  it('should have multiple lockfiles warnings', async () => {
    expect(next.cliOutput).toMatch(
      /We detected multiple lockfiles and selected the directory of .+ as the root directory\./
    )

    if (isTurbopack) {
      expect(next.cliOutput).toMatch(
        /To silence this warning, set `turbopack\.root` in your Next\.js config, or consider removing one of the lockfiles if it's not needed\./
      )
    } else {
      expect(next.cliOutput).toMatch(
        /To silence this warning, set `outputFileTracingRoot` in your Next\.js config, or consider removing one of the lockfiles if it's not needed\./
      )
    }
  })
})
