import { dirname, join } from 'path'
import { FileRef, isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  multipleLockfilesWarning,
  packageJson,
  packageLock,
} from './test-utils'

// Run the Next.js binary directly. These tests point `HOME` at a directory
// inside the isolated test directory, where `pnpm` would not find its cache.
const nextBin = 'node node_modules/next/dist/bin/next'

// Both cases share this layout and only differ in the home directory that the
// Next.js process sees:
//
// <isolation root>/        a lockfile
// └── project/             a lockfile
//     └── app/             the Next.js app
const cases: Array<{
  name: string
  getHome: (testDir: string) => string
  // the outermost directory whose lockfile is still used as the root.
  getRoot: (testDir: string) => string
  // the lockfile named by the multiple lockfiles warning, if it is expected.
  getRootLockFile: (testDir: string) => string | null
}> = [
  {
    name: 'above the project',
    getHome: (testDir) => dirname(dirname(testDir)),
    getRoot: (testDir) => dirname(testDir),
    getRootLockFile: (testDir) => join(dirname(testDir), 'package-lock.json'),
  },
  {
    // the app directory is always usable as the root, even when it is the home
    // directory itself.
    name: 'at the app',
    getHome: (testDir) => testDir,
    getRoot: (testDir) => testDir,
    getRootLockFile: () => null,
  },
]

// This suite changes HOME for a locally managed Next.js process and inspects
// its CLI output.
// @force-gate !deploy
describe.each(cases)(
  'root-detection - home directory boundary ($name)',
  ({ getHome, getRoot, getRootLockFile }) => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        '../package.json': packageJson('project'),
        '../package-lock.json': packageLock('project'),
        '../../package.json': packageJson('above-project'),
        '../../package-lock.json': packageLock('above-project'),
      },
      // So that the files written above don't leave the isolated testDir
      subDir: 'project/app',
      // The workspace file would stop the search before the home directory
      // boundary does, so the test wouldn't be exercising the boundary.
      deleteWorkspaceFile: true,
      // The home directory is only known once the test directory exists.
      skipStart: true,
      buildCommand: `${nextBin} build`,
      startCommand: `${nextBin} ${isNextDev ? 'dev' : 'start'}`,
    })

    beforeAll(async () => {
      const home = getHome(next.testDir)
      next.env.HOME = home
      // `os.homedir()` reads `USERPROFILE` on Windows.
      next.env.USERPROFILE = home
      await next.start()
    })

    it('should not select the home directory as the root', async () => {
      const home = getHome(next.testDir)
      const root = getRoot(next.testDir)
      const rootLockFile = getRootLockFile(next.testDir)

      await retry(async () => {
        expect(next.cliOutput).toContain(
          `Next.js ignored package-lock.json in ${dirname(
            root
          )} because it would include your home directory (${home}).`
        )
      })

      if (rootLockFile) {
        expect(next.cliOutput).toContain(
          `We detected multiple lockfiles and selected the directory of ${rootLockFile} as the root directory.`
        )
      } else {
        expect(next.cliOutput).not.toMatch(multipleLockfilesWarning)
      }
    })

    it('should serve the app', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
    })
  }
)
