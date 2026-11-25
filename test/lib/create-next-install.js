const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const childProcess = require('child_process')
const treeKill = require('tree-kill')
const { randomBytes } = require('crypto')
const { linkPackages } = require('./link-packed-packages')
const lockfile = require('proper-lockfile')
const yaml = require('js-yaml')
const {
  getPnpmSecuritySettings,
  mergeSettingsIntoYaml,
  getYarnSecuritySettings,
  mergeYarnSecuritySettingsIntoYaml,
} = require('./pnpm-security-settings')

const PREFER_OFFLINE = process.env.NEXT_TEST_PREFER_OFFLINE === '1'
const useRspack = process.env.NEXT_TEST_USE_RSPACK === '1'
const ROOT_PACKAGE_MANAGER = require('../../package.json').packageManager
const DEFAULT_INSTALL_TIMEOUT_MS = 5 * 60 * 1000
const MAX_TIMER_DELAY_MS = 2_147_483_647

function getInstallTimeoutMs() {
  const value = Number(process.env.NEXT_TEST_INSTALL_TIMEOUT_MS)
  return Number.isInteger(value) && value > 0 && value <= MAX_TIMER_DELAY_MS
    ? value
    : DEFAULT_INSTALL_TIMEOUT_MS
}

/**
 * Runs a custom install command without blocking the event loop, so Jest can
 * still enforce hook and test timeouts. When the install deadline fires, the
 * whole process tree is killed before the returned promise rejects.
 *
 * @param {string} command
 * @param {string} cwd
 * @param {number} [timeoutMs]
 */
function runCustomInstall(command, cwd, timeoutMs = getInstallTimeoutMs()) {
  return new Promise((resolve, reject) => {
    let settled = false
    /** @type {Error | null} */
    let timeoutError = null
    const child = childProcess.spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    const finish = (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }

    const timer = setTimeout(() => {
      timeoutError = new Error(
        `Custom install command timed out after ${timeoutMs}ms: ${command}`
      )
      if (child.pid === undefined) {
        finish(timeoutError)
        return
      }
      treeKill(child.pid, 'SIGKILL', (killErr) => {
        if (killErr && timeoutError) {
          timeoutError.message += ` (failed to kill process tree: ${killErr.message})`
        }
        finish(timeoutError)
      })
    }, timeoutMs)

    child.once('error', finish)
    child.once('exit', (code, signal) => {
      // On timeout, wait for tree-kill to finish before rejecting so no
      // descendants are left behind.
      if (timeoutError) return
      if (code === 0) {
        finish()
        return
      }
      finish(
        new Error(
          `Custom install command failed with ${
            signal ? `signal ${signal}` : `code ${code}`
          }: ${command}`
        )
      )
    })
  })
}

const PNPM_TEST_DIR_SETTINGS = {
  // fixtures depend on packages with build scripts that they don't declare in `allowBuilds`: this
  // will skip them (`allowBuilds` defaults to `false` for unlisted packages) instead of failing
  strictDepBuilds: false,
  // pnpm auto-installs before running scripts, we want to be explicit about this in tests
  verifyDepsBeforeRun: false,
}

async function installDependencies(cwd, tmpDir) {
  const args = [
    'install',
    '--strict-peer-dependencies=false',
    '--no-frozen-lockfile',
    `--config.cacheDir=${tmpDir}`,
  ]

  if (PREFER_OFFLINE) {
    args.push('--prefer-offline')
  }

  await execa('pnpm', args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
}

/**
 * Finds `fileName` in the dirs from `installDir` up to `isolationRoot`
 * (inclusive), or null if absent.
 *
 * @param {string} fileName
 * @param {string} installDir
 * @param {string} isolationRoot
 * @returns {Promise<string | null>}
 */
async function findConfigFile(fileName, installDir, isolationRoot) {
  let dir = path.resolve(installDir)
  const stopDir = path.resolve(isolationRoot)
  while (true) {
    const file = path.join(dir, fileName)
    if (await fs.pathExists(file)) {
      return file
    }
    if (dir === stopDir) break
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Applies the supply-chain security settings from the repo root
 * `pnpm-workspace.yaml` to installs in the isolated test dir, by writing (or
 * merging into) a `pnpm-workspace.yaml` and a `.yarnrc.yml`. npm added
 * equivalent functionality in 11.10.0; we can configure it here once we
 * upgrade npm.
 *
 * @param {string} installDir
 * @param {string} isolationRoot
 * @returns {Promise<void>}
 */
async function applyInstallSecuritySettings(installDir, isolationRoot) {
  const pnpmSettings = {
    ...getPnpmSecuritySettings(),
    ...PNPM_TEST_DIR_SETTINGS,
  }
  const workspaceFile = await findConfigFile(
    'pnpm-workspace.yaml',
    installDir,
    isolationRoot
  )
  if (workspaceFile !== null) {
    await fs.writeFile(
      workspaceFile,
      mergeSettingsIntoYaml(
        await fs.readFile(workspaceFile, 'utf8'),
        pnpmSettings
      )
    )
  } else {
    await fs.writeFile(
      path.join(installDir, 'pnpm-workspace.yaml'),
      yaml.dump(pnpmSettings)
    )
  }

  const yarnrcFile = await findConfigFile(
    '.yarnrc.yml',
    installDir,
    isolationRoot
  )
  if (yarnrcFile !== null) {
    await fs.writeFile(
      yarnrcFile,
      mergeYarnSecuritySettingsIntoYaml(await fs.readFile(yarnrcFile, 'utf8'))
    )
  } else {
    await fs.writeFile(
      path.join(installDir, '.yarnrc.yml'),
      yaml.dump(getYarnSecuritySettings())
    )
  }
}

/**
 * pnpm only honors overrides at the workspace root, so they go into the
 * `pnpm-workspace.yaml` that governs the install.
 *
 * @param {string} installDir
 * @param {string} isolationRoot
 * @param {Record<string, string>} overrides
 * @returns {Promise<void>}
 */
async function applyWorkspaceOverrides(installDir, isolationRoot, overrides) {
  const workspaceFile = await findConfigFile(
    'pnpm-workspace.yaml',
    installDir,
    isolationRoot
  )
  if (workspaceFile === null) {
    return
  }

  const workspaceConfig =
    /** @type {Record<string, any>} */ (
      yaml.load(await fs.readFile(workspaceFile, 'utf8'))
    ) ?? {}
  workspaceConfig.overrides = {
    ...overrides,
    ...(workspaceConfig.overrides || {}),
  }
  await fs.writeFile(workspaceFile, yaml.dump(workspaceConfig))
}

/**
 * pnpm's hoisted linker does not expose the `@pkg+name@file` virtual-store
 * path used by the default linker. Verify the exact local tarball through the
 * lockfile instead.
 *
 * @param {string} installDir
 * @param {string} packageName
 * @param {string} expectedTarballPath
 * @returns {Promise<boolean>}
 */
async function lockfileResolvesLocalTarball(
  installDir,
  packageName,
  expectedTarballPath
) {
  // pnpm 11+ prepends a separate YAML document that locks pnpm itself.
  const lockfileDocuments = /** @type {Record<string, any>[]} */ (
    yaml.loadAll(
      await fs.readFile(path.join(installDir, 'pnpm-lock.yaml'), 'utf8')
    )
  )
  const expectedRealpath = await fs.realpath(expectedTarballPath)

  for (const [key, pkg] of lockfileDocuments.flatMap((lockfile) =>
    Object.entries(lockfile?.packages || {})
  )) {
    const tarball = pkg?.resolution?.tarball
    if (
      !key.startsWith(`${packageName}@file:`) ||
      typeof tarball !== 'string' ||
      !tarball.startsWith('file:')
    ) {
      continue
    }

    const resolvedTarball = path.resolve(
      installDir,
      tarball.slice('file:'.length)
    )
    if ((await fs.realpath(resolvedTarball)) === expectedRealpath) {
      return true
    }
  }
  return false
}

/**
 * @param {import('next/dist/trace').Span} parentSpan
 * @returns {Promise<Map<string, string>>}
 */
async function packPackages(parentSpan) {
  const repositoryDirectory = await fs.realpath(path.join(__dirname, '../..'))
  const cacheDir = path.join(repositoryDirectory, '.turbo')
  await fs.ensureDir(cacheDir)
  // Serialize the entire Turbo invocation, including cache restoration, when
  // multiple test runners start in parallel.
  const release = await lockfile.lock(repositoryDirectory, {
    lockfilePath: path.join(cacheDir, 'pack-for-isolated-tests.lock'),
    stale: 10 * 60 * 1000,
    update: 10 * 1000,
    retries: { retries: 3600, factor: 1, minTimeout: 1000, maxTimeout: 1000 },
  })
  try {
    await parentSpan.traceChild('turbo-run-pack').traceAsyncFn(() =>
      execa(
        'pnpm',
        [
          'turbo',
          'run',
          'pack-for-isolated-tests',
          '--output-logs',
          'new-only',
          '--ui',
          'stream',
        ],
        {
          cwd: repositoryDirectory,
          stdio: ['ignore', 'inherit', 'inherit'],
        }
      )
    )
    return await parentSpan
      .traceChild('linkPackages')
      .traceAsyncFn(() => linkPackages({ repoDir: repositoryDirectory }))
  } finally {
    await release()
  }
}

/**
 *
 * @param {object} param0
 * @param {import('@next/telemetry').Span} param0.parentSpan
 * @param {object} [param0.dependencies]
 * @param {object | null} [param0.resolutions]
 * @param { ((ctx: { dependencies: { [key: string]: string } }) => string) | string | null} [param0.installCommand]
 * @param {object} [param0.packageJson]
 * @param {string} [param0.subDir]
 * @param {(span: import('@next/telemetry').Span, installDir: string) => Promise<void>} [param0.beforeInstall]
 * @returns {Promise<{installDir: string, pkgPaths: Map<string, string>}>}
 */
async function createNextInstall({
  parentSpan,
  dependencies = {},
  resolutions = null,
  installCommand = null,
  packageJson = {},
  subDir = '',
  beforeInstall,
}) {
  const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())

  return await parentSpan
    .traceChild('createNextInstall')
    .traceAsyncFn(async (rootSpan) => {
      const origRepoDir = path.join(__dirname, '../../')
      const isolationRoot = path.join(
        tmpDir,
        `next-install-${randomBytes(32).toString('hex')}`
      )
      const installDir = path.join(isolationRoot, subDir)
      require('console').log('Creating next instance in:')
      require('console').log(installDir)

      const pkgPathsEnv = process.env.NEXT_TEST_PKG_PATHS
      let pkgPaths

      if (pkgPathsEnv) {
        pkgPaths = new Map(JSON.parse(pkgPathsEnv))
        require('console').log('using provided pkg paths')
      } else {
        pkgPaths = await packPackages(rootSpan)

        if (process.env.NEXT_TEST_WASM) {
          const wasmPath = path.join(origRepoDir, 'crates', 'wasm', 'pkg')
          const hasWasmBinary = fs.existsSync(
            path.join(wasmPath, 'package.json')
          )
          if (hasWasmBinary) {
            process.env.NEXT_TEST_WASM_DIR = wasmPath
          }
        } else {
          const nativePath = path.join(origRepoDir, 'packages/next-swc/native')
          const hasNativeBinary = fs.existsSync(nativePath)
            ? fs.readdirSync(nativePath).some((item) => item.endsWith('.node'))
            : false

          if (hasNativeBinary) {
            process.env.NEXT_TEST_NATIVE_DIR = nativePath
          } else {
            const swcDirectory = fs
              .readdirSync(path.join(origRepoDir, 'node_modules/@next'))
              .find((directory) => directory.startsWith('swc-'))
            process.env.NEXT_TEST_NATIVE_DIR = path.join(
              origRepoDir,
              'node_modules/@next',
              swcDirectory
            )
          }
        }

        require('console').log({
          swcNativeDirectory: process.env.NEXT_TEST_NATIVE_DIR,
          swcWasmDirectory: process.env.NEXT_TEST_WASM_DIR,
        })
      }

      const combinedDependencies = {
        next: pkgPaths.get('next'),
        ...Object.keys(dependencies).reduce((prev, pkg) => {
          const pkgPath = pkgPaths.get(pkg)
          const version = dependencies[pkg]
          if (version === 'workspace:*') {
            if (pkgPath) {
              prev[pkg] = pkgPath
            } else {
              throw new Error(
                `"${pkg}" is declared as "workspace:*" but no packed tarball was found for it. ` +
                  `Only packages in this repository with a "pack-for-isolated-tests" script can be used with "workspace:*".`
              )
            }
          } else {
            prev[pkg] = pkgPath || version
          }
          return prev
        }, {}),
      }

      if (useRspack) {
        combinedDependencies['next-rspack'] = pkgPaths.get('next-rspack')
      }

      // Build overrides to resolve transitive workspace deps from local
      // tarballs. Write all three formats so npm, pnpm, and yarn all work.
      const workspacePkgOverrides = {}
      for (const [name, tarballPath] of pkgPaths.entries()) {
        if (!combinedDependencies[name]) {
          workspacePkgOverrides[name] = tarballPath
        }
      }

      const scripts = {
        debug: `NEXT_PRIVATE_SKIP_CANARY_CHECK=1 NEXT_TELEMETRY_DISABLED=1 NEXT_TEST_NATIVE_DIR=${process.env.NEXT_TEST_NATIVE_DIR} node --inspect --trace-deprecation --enable-source-maps node_modules/next/dist/bin/next`,
        'debug-brk': `NEXT_PRIVATE_SKIP_CANARY_CHECK=1 NEXT_TELEMETRY_DISABLED=1 NEXT_TEST_NATIVE_DIR=${process.env.NEXT_TEST_NATIVE_DIR} node --inspect-brk --trace-deprecation --enable-source-maps node_modules/next/dist/bin/next`,
        ...packageJson.scripts,
      }

      // Pin the same pnpm version the repo uses so corepack resolves a
      // consistent pnpm across isolated test dirs. Without this, `pnpm` may
      // fall back to whatever version is installed at the system level, which
      // can disagree with the repo's `packageManager` field and cause mismatch
      // errors (e.g. pnpm-workspace.yaml written for v10 parsed by v9).
      //
      // Only fall back to the root `packageManager` for the default pnpm
      // install path. Tests that provide their own `installCommand` (e.g.
      // yarn-pnp) need to switch package managers themselves and would be
      // blocked by corepack if the file already pinned `pnpm@...`.
      const rootPackageManager = require(
        path.join(__dirname, '../../package.json')
      ).packageManager
      const packageManagerField =
        packageJson.packageManager ||
        (installCommand ? undefined : rootPackageManager)

      await fs.ensureDir(installDir)
      await fs.writeFile(
        path.join(installDir, 'package.json'),
        JSON.stringify(
          {
            // Pin packageManager so corepack doesn't auto-inject a reference
            // to the latest version (and rewrite this file mid-test).
            // Callers can override via packageJson.packageManager.
            packageManager: ROOT_PACKAGE_MANAGER,
            ...packageJson,
            ...(packageManagerField && { packageManager: packageManagerField }),
            scripts,
            dependencies: combinedDependencies,
            private: true,
            overrides: {
              ...workspacePkgOverrides,
              ...(packageJson.overrides || {}),
            },
            resolutions: {
              ...workspacePkgOverrides,
              ...(resolutions || {}),
            },
          },
          null,
          2
        )
      )

      if (beforeInstall !== undefined) {
        await rootSpan
          .traceChild('beforeInstall')
          .traceAsyncFn(async (span) => {
            await beforeInstall(span, installDir)
          })
      }

      const installString = installCommand
        ? typeof installCommand === 'function'
          ? installCommand({
              dependencies: combinedDependencies,
              resolutions,
            })
          : installCommand
        : null

      await applyInstallSecuritySettings(installDir, isolationRoot)
      await applyWorkspaceOverrides(installDir, isolationRoot, {
        ...workspacePkgOverrides,
        ...(resolutions || {}),
      })

      if (installString !== null) {
        console.log('running install command', installString)
        await rootSpan
          .traceChild('run custom install')
          .traceAsyncFn(() => runCustomInstall(installString, installDir))
      } else {
        await rootSpan
          .traceChild('run generic install command', combinedDependencies)
          .traceAsyncFn(() => installDependencies(installDir, tmpDir))

        // `@next/env` is a dependency of `next`, so it only resolves to the
        // local tarball if the overrides were applied. Every generic isolated
        // install reaches this guard, but the lockfile fallback short-circuits
        // off when the default linker exposes its virtual-store path.
        if (!combinedDependencies['@next/env']) {
          const envDir = await fs.realpath(
            path.join(
              await fs.realpath(path.join(installDir, 'node_modules/next')),
              '../@next/env'
            )
          )
          const envTarballPath = pkgPaths.get('@next/env')
          if (
            !envDir.includes('@next+env@file') &&
            !(
              envTarballPath &&
              (await lockfileResolvesLocalTarball(
                installDir,
                '@next/env',
                envTarballPath
              ))
            )
          ) {
            throw new Error(
              `@next/env resolved from the npm registry instead of the local tarball (${envDir}), ` +
                'the workspace overrides were not applied to the install'
            )
          }
        }
      }

      if (useRspack) {
        process.env.NEXT_RSPACK = 'true'
        process.env.RSPACK_CONFIG_VALIDATE = 'loose-silent'
      }

      return {
        installDir,
        pkgPaths,
      }
    })
}

module.exports = {
  PNPM_TEST_DIR_SETTINGS,
  createNextInstall,
  getPkgPaths: linkPackages,
  packPackages,
  runCustomInstall,
}
