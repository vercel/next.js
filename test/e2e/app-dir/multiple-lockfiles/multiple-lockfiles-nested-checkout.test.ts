import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('multiple-lockfiles - nested checkout', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      // A git worktree placed inside another checkout (e.g. `git worktree
      // add` into a directory of the main checkout) has a `.git` file
      // pointing at the main repository's git directory, and is a complete
      // workspace of its own.
      '.git': 'gitdir: /nonexistent/.git/worktrees/nested-checkout\n',
      'pnpm-workspace.yaml': 'packages: []\n',
      // The outer checkout is a workspace of its own. Its files must not be
      // treated as this app's workspace root.
      '../pnpm-workspace.yaml': 'packages:\n  - "test"\n',
      '../package-lock.json': JSON.stringify({
        name: 'parent-workspace',
        version: '1.0.0',
        lockfileVersion: 3,
      }),
    },
    // So that the outer checkout's files don't leave the isolated testDir
    subDir: 'test',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('does not treat the outer checkout as the workspace root', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    // The walk up from the app directory must stop at the repository
    // boundary (the `.git` file), so the outer checkout's lockfiles are
    // never picked up.
    expect(next.cliOutput).not.toMatch(
      /We detected multiple lockfiles and selected the directory of .+ as the root directory\./
    )
  })
})
