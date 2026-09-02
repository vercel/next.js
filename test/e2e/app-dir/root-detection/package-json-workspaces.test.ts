import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  gitRepositoryBoundaryWarning,
  homeDirectoryBoundaryWarning,
  multipleLockfilesWarning,
  packageJson,
  packageLock,
} from './test-utils'

// npm, Yarn, and Bun declare a workspace root with a `workspaces` field:
//
// <isolation root>/          the workspace root, and the expected root
// ├── package.json           declares `workspaces`
// ├── package-lock.json
// ├── shared/utils.ts        imported by the app
// └── test/                  the Next.js app, with a lockfile of its own
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('root-detection - package.json workspaces', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'workspace-app')),
      '../package.json': packageJson('workspace-root', {
        private: true,
        workspaces: ['test'],
      }),
      '../package-lock.json': packageLock('workspace-root'),
      '../shared/utils.ts': `export const message = 'hello world'\n`,
    },
    // So that the files written above don't leave the isolated testDir
    subDir: 'test',
    // The workspace file would make the app directory a workspace root of its
    // own, so the test wouldn't be exercising the `workspaces` field.
    deleteWorkspaceFile: true,
  })

  it('should select the workspace root as the root', async () => {
    // the app imports a file from the workspace root, which is only reachable
    // when the root includes it.
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })

  it('should not warn about the lockfiles below the workspace root', async () => {
    // the `workspaces` field settles where the root is, so neither lockfile is
    // ambiguous.
    expect(next.cliOutput).not.toMatch(multipleLockfilesWarning)
    expect(next.cliOutput).not.toMatch(gitRepositoryBoundaryWarning)
    expect(next.cliOutput).not.toMatch(homeDirectoryBoundaryWarning)
  })
})
