/* eslint-env jest */
import execa from 'execa'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const pnpmExecutable = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'node_modules',
  '.bin',
  'pnpm'
)
const nextPackageDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'next'
)
const appDir = path.join(__dirname, '..', 'app')

jest.setTimeout(1000 * 60 * 5)

const runPnpm = (cwd, ...args) => execa(pnpmExecutable, [...args], { cwd })

async function usingTempDir(fn) {
  const folder = path.join(os.tmpdir(), Math.random().toString(36).substring(2))
  await fs.mkdirp(folder)
  try {
    return await fn(folder)
  } finally {
    await fs.remove(folder)
  }
}

async function packNextTarball(fn) {
  const { stdout } = await execa(pnpmExecutable, ['pack'], {
    cwd: nextPackageDir,
  })
  const tarballFilename = stdout.match(/.*\.tgz/)[0]

  if (!tarballFilename) {
    throw new Error(
      `pnpm failed to pack "next" package tarball in directory ${nextPackageDir}.`
    )
  }

  const tarballPath = path.join(nextPackageDir, tarballFilename)
  try {
    return await fn(tarballPath)
  } finally {
    await fs.unlink(tarballPath)
  }
}

describe('pnpm support', () => {
  it('should build with dependencies installed via pnpm', async () => {
    // Create a Next.js app in a temporary directory, and install dependencies with pnpm.
    // "next" is installed by packing a tarball from 'next.js/packages/next', because installing
    // "next" directly via `pnpm add path/to/next.js/packages/next` results in a symlink:
    // 'app/node_modules/next' -> 'path/to/next.js/packages/next'. This is undesired since modules
    // inside "next" would be resolved to the next.js monorepo 'node_modules'; installing from a
    // tarball avoids this issue.
    await usingTempDir(async (cwd) => {
      await packNextTarball(async (nextTarballPath) => {
        await fs.copy(appDir, cwd)
        await runPnpm(cwd, 'install')
        await runPnpm(cwd, 'add', nextTarballPath)

        expect(
          require(path.join(cwd, 'package.json')).dependencies['next']
        ).toBe(`file:${nextTarballPath}`)
        expect(
          await fs.pathExists(path.join(cwd, 'pnpm-lock.yaml'))
        ).toBeTruthy()

        const { stdout } = await runPnpm(cwd, 'run', 'build')
        expect(stdout).toMatch(/Compiled successfully/)
      })
    })
  })
})
