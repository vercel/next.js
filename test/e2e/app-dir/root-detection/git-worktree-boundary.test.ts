import { dirname, join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  gitRepositoryBoundaryWarning,
  packageJson,
  packageLock,
} from './test-utils'

// <isolation root>/                   a lockfile that belongs to the checkout
// ├── repo/.git/worktrees/worktree/    the Git directory of the worktree
// └── worktree/                        a linked worktree, and the expected root
//     ├── .git                         a file pointing at the Git directory
//     ├── package-lock.json
//     └── app/                         the Next.js app
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('root-detection - git worktree boundary', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      '../.git': 'gitdir: ../repo/.git/worktrees/worktree\n',
      // the Git directory of a linked worktree holds a `commondir` file, which
      // is what tells a worktree apart from a submodule.
      '../../repo/.git/worktrees/worktree/commondir': '../..\n',
      '../package.json': packageJson('worktree'),
      '../package-lock.json': packageLock('worktree'),
      '../../package.json': packageJson('above-worktree'),
      '../../package-lock.json': packageLock('above-worktree'),
    },
    // So that the files written above don't leave the isolated testDir
    subDir: 'worktree/app',
    // The workspace file would stop the search before the worktree boundary
    // does, so the test wouldn't be exercising the boundary.
    deleteWorkspaceFile: true,
  })

  it('should not select a root above the worktree', async () => {
    const worktreeDir = dirname(next.testDir)

    await retry(async () => {
      // the lockfile inside the worktree is used, the one above it is not.
      expect(next.cliOutput).toContain(
        `We detected multiple lockfiles and selected the directory of ${join(
          worktreeDir,
          'package-lock.json'
        )} as the root directory.`
      )
    })

    // a worktree is a checkout of its repository, so stopping at one is
    // expected and is not reported as a boundary.
    expect(next.cliOutput).not.toMatch(gitRepositoryBoundaryWarning)
  })

  it('should serve the app', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
