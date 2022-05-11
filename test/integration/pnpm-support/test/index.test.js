/* eslint-env jest */
import execa from 'execa'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { findPort, killProcess, renderViaHTTP, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'

const packagesDir = path.join(__dirname, '..', '..', '..', '..', 'packages')

const APP_DIRS = {
  app: path.join(__dirname, '..', 'app'),
  'app-multi-page': path.join(__dirname, '..', 'app-multi-page'),
}

// runs a command showing logs and returning the stdout
const runCommand = (cwd, cmd, args) => {
  const proc = execa(cmd, [...args], {
    cwd,
    stdio: [process.stdin, 'pipe', process.stderr],
  })

  let stdout = ''
  proc.stdout.on('data', (data) => {
    const s = data.toString()
    process.stdout.write(s)
    stdout += s
  })
  return new Promise((resolve, reject) => {
    proc.on('exit', (code) => {
      if (code === 0) {
        return resolve({ ...proc, stdout })
      }
      reject(
        new Error(`Command ${cmd} ${args.join(' ')} failed with code ${code}`)
      )
    })
  })
}

const runNpm = (cwd, ...args) => execa('npm', [...args], { cwd })
const runPnpm = (cwd, ...args) => runCommand(cwd, 'npx', ['pnpm', ...args])

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
      `npm failed to pack "next" package tarball in directory ${pkgDir}.`
    )
  }

  return path.join(cwd, tarballFilename)
}

/**
 * Create a Next.js app in a temporary directory, and install dependencies with pnpm.
 *
 * "next" and its monorepo dependencies are installed by `npm pack`-ing tarballs from
 * 'next.js/packages/*', because installing "next" directly via
 * `pnpm add path/to/next.js/packages/next` results in a symlink:
 * 'app/node_modules/next' -> 'path/to/next.js/packages/next'.
 * This is undesired since modules inside "next" would be resolved to the
 * next.js monorepo 'node_modules' and lead to false test results;
 * installing from a tarball avoids this issue.
 *
 * The "next" package's monorepo dependencies (e.g. "@next/env", "@next/polyfill-module")
 * are not bundled with `npm pack next.js/packages/next`,
 * so they need to be packed individually.
 * To ensure that they are installed upon installing "next", a package.json "pnpm.overrides"
 * field is used to override these dependency paths at install time.
 */
async function usingPnpmCreateNextApp(appDir, fn) {
  await usingTempDir(async (tempDir) => {
    const nextTarballPath = await pack(tempDir, 'next')
    const dependencyTarballPaths = {
      '@next/env': await pack(tempDir, 'next-env'),
      '@next/polyfill-module': await pack(tempDir, 'next-polyfill-module'),
      '@next/polyfill-nomodule': await pack(tempDir, 'next-polyfill-nomodule'),
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
    await runPnpm(tempAppDir, 'add', `next@${nextTarballPath}`)

    await fs.copy(
      path.join(__dirname, '../../../../packages/next-swc/native'),
      path.join(tempAppDir, 'node_modules/next-swc/native')
    )

    await fn(tempAppDir)
  })
}

describe('pnpm support', () => {
  it('should build with dependencies installed via pnpm', async () => {
    await usingPnpmCreateNextApp(APP_DIRS['app'], async (appDir) => {
      expect(
        await fs.pathExists(path.join(appDir, 'pnpm-lock.yaml'))
      ).toBeTruthy()

      const packageJsonPath = path.join(appDir, 'package.json')
      const packageJson = await fs.readJson(packageJsonPath)
      expect(packageJson.dependencies['next']).toMatch(/^file:/)
      for (const dependency of [
        '@next/env',
        '@next/polyfill-module',
        '@next/polyfill-nomodule',
        '@next/react-dev-overlay',
        '@next/react-refresh-utils',
      ]) {
        expect(packageJson.pnpm.overrides[dependency]).toMatch(/^file:/)
      }

      const { stdout } = await runPnpm(appDir, 'run', 'build')

      expect(stdout).toMatch(/Compiled successfully/)
    })
  })

  it('should execute client-side JS on each page in outputStandalone', async () => {
    await usingPnpmCreateNextApp(APP_DIRS['app-multi-page'], async (appDir) => {
      const { stdout } = await runPnpm(appDir, 'run', 'build')

      expect(stdout).toMatch(/Compiled successfully/)

      let appPort
      let appProcess
      let browser
      try {
        appPort = await findPort()
        const standaloneDir = path.resolve(appDir, '.next/standalone/app')

        // simulate what happens in a Dockerfile
        await fs.remove(path.join(appDir, 'node_modules'))
        await fs.copy(
          path.resolve(appDir, './.next/static'),
          path.resolve(standaloneDir, './.next/static'),
          { overwrite: true }
        )
        appProcess = execa('node', ['server.js'], {
          cwd: standaloneDir,
          env: {
            PORT: appPort,
          },
          stdio: 'inherit',
        })

        await waitFor(1000)

        await renderViaHTTP(appPort, '/')

        browser = await webdriver(appPort, '/', {
          waitHydration: false,
        })
        expect(await browser.waitForElementByCss('#world').text()).toBe('World')
        await browser.close()

        browser = await webdriver(appPort, '/about', {
          waitHydration: false,
        })
        expect(await browser.waitForElementByCss('#world').text()).toBe('World')
        await browser.close()
      } finally {
        await killProcess(appProcess.pid)
        await waitFor(5000)
      }
    })
  })

  it('should execute client-side JS on each page', async () => {
    await usingPnpmCreateNextApp(APP_DIRS['app-multi-page'], async (appDir) => {
      const { stdout } = await runPnpm(appDir, 'run', 'build')

      expect(stdout).toMatch(/Compiled successfully/)

      let appPort
      let appProcess
      let browser
      try {
        appPort = await findPort()
        appProcess = execa('pnpm', ['run', 'start', '--', '--port', appPort], {
          cwd: appDir,
          stdio: 'inherit',
        })

        await waitFor(5000)

        await renderViaHTTP(appPort, '/')

        browser = await webdriver(appPort, '/', {
          waitHydration: false,
        })
        expect(await browser.waitForElementByCss('#world').text()).toBe('World')
        await browser.close()

        browser = await webdriver(appPort, '/about', {
          waitHydration: false,
        })
        expect(await browser.waitForElementByCss('#world').text()).toBe('World')
        await browser.close()
      } finally {
        await killProcess(appProcess.pid)
        await waitFor(5000)
      }
    })
  })
})
