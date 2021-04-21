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
const packagesDir = path.join(__dirname, '..', '..', '..', '..', 'packages')
const appDir = path.join(__dirname, '..', 'app')

jest.setTimeout(1000 * 60 * 5)

const runNpm = (cwd, ...args) => execa('npm', [...args], { cwd })
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

/**
 * Using 'npm pack', create a tarball of the given package in
 * directory `pkg` and write it to `cwd`.
 *
 * `pkg` is relative to the monorepo 'packages/' directory.
 *
 * Return the absolute path to the tarball.
 */
async function pack(cwd, pkg) {
  const pkgDir = path.join(packagesDir, pkg)
  const { stdout } = await runNpm(
    cwd,
    'pack',
    '--ignore-scripts', // Skip the prepublish script
    path.join(packagesDir, pkg)
  )
  const tarballFilename = stdout.match(/.*\.tgz/)[0]

  if (!tarballFilename) {
    throw new Error(
      `pnpm failed to pack "next" package tarball in directory ${pkgDir}.`
    )
  }

  return path.join(cwd, tarballFilename)
}

describe('pnpm support', () => {
  it('should build with dependencies installed via pnpm', async () => {
    // Create a Next.js app in a temporary directory, and install dependencies with pnpm.
    //
    // "next" and its monorepo dependencies are installed by `npm pack`-ing tarballs from
    // 'next.js/packages/*', because installing "next" directly via
    // `pnpm add path/to/next.js/packages/next` results in a symlink:
    // 'app/node_modules/next' -> 'path/to/next.js/packages/next'.
    // This is undesired since modules inside "next" would be resolved to the
    // next.js monorepo 'node_modules' and lead to false test results;
    // installing from a tarball avoids this issue.
    //
    // The "next" package's monorepo dependencies (e.g. "@next/env", "@next/polyfill-module")
    // are not bundled with `npm pack next.js/packages/next`,
    // so they need to be packed individually.
    // To ensure that they are installed upon installing "next", a package.json "pnpm.overrides"
    // field is used to override these dependency paths at install time.
    await usingTempDir(async (tempDir) => {
      const nextTarballPath = await pack(tempDir, 'next')
      const dependencyTarballPaths = {
        '@next/env': await pack(tempDir, 'next-env'),
        '@next/polyfill-module': await pack(tempDir, 'next-polyfill-module'),
        '@next/react-dev-overlay': await pack(tempDir, 'react-dev-overlay'),
        '@next/react-refresh-utils': await pack(tempDir, 'react-refresh-utils'),
      }

      const tempAppDir = path.join(tempDir, 'app')
      await fs.copy(appDir, tempAppDir)

      // Inject dependency tarball paths into a "pnpm.overrides" field in package.json,
      // so that they are installed from packed tarballs rather than from the npm registry.
      const packageJsonPath = path.join(tempAppDir, 'package.json')
      const overrides = {}
      for (const [dependency, tarballPath] of Object.entries(
        dependencyTarballPaths
      )) {
        overrides[dependency] = `file:${tarballPath}`
      }
      const packageJsonWithOverrides = {
        ...(await fs.readJson(packageJsonPath)),
        pnpm: { overrides },
      }
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify(packageJsonWithOverrides, null, 2)
      )

      await runPnpm(tempAppDir, 'install')
      await runPnpm(tempAppDir, 'add', nextTarballPath)

      expect(
        await fs.pathExists(path.join(tempAppDir, 'pnpm-lock.yaml'))
      ).toBeTruthy()

      const packageJson = await fs.readJson(packageJsonPath)
      expect(packageJson.dependencies['next']).toMatch(/^file:/)
      for (const dependency of Object.keys(dependencyTarballPaths)) {
        expect(packageJson.pnpm.overrides[dependency]).toMatch(/^file:/)
      }

      const { stdout, stderr } = await runPnpm(tempAppDir, 'run', 'build')
      console.log(stdout, stderr)
      expect(stdout).toMatch(/Compiled successfully/)
    })
  })
})
