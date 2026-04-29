const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const childProcess = require('child_process')
const { randomBytes } = require('crypto')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

const PREFER_OFFLINE = process.env.NEXT_TEST_PREFER_OFFLINE === '1'
const useRspack = process.env.NEXT_TEST_USE_RSPACK === '1'

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
    env: {
      ...process.env,
      // pnpm reads this despite claims it ignores `npm_config_*` env variables.
      // This isn't set in CI but some local environments set this from the
      // pnpm-workspace.yaml for unknown reasons.
      // minimumReleaseAgeExclude is not propagated with environment variables
      // so some installs would just fail.
      // TODO: ideally every test fixture would run with minimumReleaseAgeExclude but
      // that requires some work in monorepo test suites.
      npm_config_minimum_release_age: undefined,
    },
  })
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
      const installDir = path.join(
        tmpDir,
        `next-install-${randomBytes(32).toString('hex')}`,
        subDir
      )
      require('console').log('Creating next instance in:')
      require('console').log(installDir)

      const pkgPathsEnv = process.env.NEXT_TEST_PKG_PATHS
      let pkgPaths

      if (pkgPathsEnv) {
        pkgPaths = new Map(JSON.parse(pkgPathsEnv))
        require('console').log('using provided pkg paths')
      } else {
        await rootSpan.traceChild('turbo-run-pack').traceAsyncFn(() =>
          execa(
            'pnpm',
            [
              'turbo',
              'run',
              'pack-for-isolated-tests',
              '--output-logs',
              'new-only',
              // Jest tui can't handle Turborepo tui. But we're cutting off stdin
              // so Turborepo's tui isn't interactive anyway.
              '--ui',
              'stream',
            ],
            {
              cwd: origRepoDir,
              stdio: ['ignore', 'inherit', 'inherit'],
            }
          )
        )

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

        pkgPaths = await rootSpan.traceChild('linkPackages').traceAsyncFn(() =>
          linkPackages({
            repoDir: origRepoDir,
          })
        )
      }

      const combinedDependencies = {
        next: pkgPaths.get('next'),
        ...Object.keys(dependencies).reduce((prev, pkg) => {
          const pkgPath = pkgPaths.get(pkg)
          prev[pkg] = pkgPath || dependencies[pkg]
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

      await fs.ensureDir(installDir)
      await fs.writeFile(
        path.join(installDir, 'package.json'),
        JSON.stringify(
          {
            ...packageJson,
            scripts,
            dependencies: combinedDependencies,
            private: true,
            overrides: {
              ...workspacePkgOverrides,
              ...(packageJson.overrides || {}),
            },
            pnpm: {
              ...(packageJson.pnpm || {}),
              overrides: {
                ...workspacePkgOverrides,
                ...(packageJson.pnpm?.overrides || {}),
              },
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

      if (installCommand) {
        const installString =
          typeof installCommand === 'function'
            ? installCommand({
                dependencies: combinedDependencies,
                resolutions,
              })
            : installCommand

        console.log('running install command', installString)
        rootSpan.traceChild('run custom install').traceFn(() => {
          childProcess.execSync(installString, {
            cwd: installDir,
            stdio: ['ignore', 'inherit', 'inherit'],
          })
        })
      } else {
        await rootSpan
          .traceChild('run generic install command', combinedDependencies)
          .traceAsyncFn(() => installDependencies(installDir, tmpDir))
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
  createNextInstall,
  getPkgPaths: linkPackages,
}
