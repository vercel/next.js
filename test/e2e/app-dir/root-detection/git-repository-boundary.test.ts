import { dirname, join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { packageJson, packageLock } from './test-utils'

// <isolation root>/            a lockfile that belongs to an unrelated project
// └── repo/                    a Git repository, and the expected root
//     ├── .git/
//     ├── package-lock.json
//     └── app/                 the Next.js app
describe('root-detection - git repository boundary', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      // a `.git` directory makes the parent directory a repository root.
      '../.git/HEAD': 'ref: refs/heads/main\n',
      '../package.json': packageJson('repository'),
      '../package-lock.json': packageLock('repository'),
      '../../package.json': packageJson('above-repository'),
      '../../package-lock.json': packageLock('above-repository'),
    },
    // So that the files written above don't leave the isolated testDir
    subDir: 'repo/app',
    skipDeployment: true,
    // The workspace file would stop the search before the Git boundary does,
    // so the test wouldn't be exercising the boundary.
    deleteWorkspaceFile: true,
  })

  if (skipped) {
    return
  }

  it('should not select a root above the repository', async () => {
    const repoDir = dirname(next.testDir)
    const aboveRepoDir = dirname(repoDir)
    const config = isTurbopack ? 'turbopack.root' : 'outputFileTracingRoot'

    await retry(async () => {
      expect(next.cliOutput).toContain(
        `Next.js ignored package-lock.json in ${aboveRepoDir} because it is outside the current Git repository (${repoDir}).`
      )
      expect(next.cliOutput).toContain(
        `To use this directory, set \`${config}\` in your Next.js config.`
      )
      // the lockfile inside the repository is still used, so the root is the
      // repository rather than the app directory.
      expect(next.cliOutput).toContain(
        `We detected multiple lockfiles and selected the directory of ${join(
          repoDir,
          'package-lock.json'
        )} as the root directory.`
      )
    })
  })

  it('should serve the app', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
