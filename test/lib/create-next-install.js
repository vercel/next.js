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
    // For the testing installation, use a separate cache directory
    // to avoid local testing grows pnpm's default cache indefinitely with test packages.
    `--config.cacheDir=${tmpDir}`,
  ]

  if (PREFER_OFFLINE) {
    args.push('--prefer-offline')
  }

  await execa('pnpm', args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
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
 * @param {boolean} [param0.keepRepoDir]
 * @param {(span: import('@next/telemetry').Span, installDir: string) => Promise<void>} param0.beforeInstall
 * @returns {Promise<{installDir: string, pkgPaths: Map<string, string>, tmpRepoDir: string | undefined}>}
 */
async function createNextInstall({
  parentSpan,
  dependencies = {},
  resolutions = null,
  installCommand = null,
  packageJson = {},
  subDir = '',
  keepRepoDir = false,
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
      let tmpRepoDir
      require('console').log('Creating next instance in:')
      require('console').log(installDir)

      const pkgPathsEnv = process.env.NEXT_TEST_PKG_PATHS
      let pkgPaths

      if (pkgPathsEnv) {
        pkgPaths = new Map(JSON.parse(pkgPathsEnv))
        require('console').log('using provided pkg paths')
      } else {
        tmpRepoDir = path.join(
          tmpDir,
          `next-repo-${randomBytes(32).toString('hex')}`,
          subDir
        )
        require('console').log('Creating temp repo dir', tmpRepoDir)

        for (const item of [
          'package.json',
          'packages',
          // Otherwise pnpm will not recognize workspaces
          'pnpm-workspace.yaml',
        ]) {
          await rootSpan
            .traceChild(`copy ${item} to temp dir`)
            .traceAsyncFn(() =>
              fs.copy(
                path.join(origRepoDir, item),
                path.join(tmpRepoDir, item),
                {
                  filter: (item) => {
                    return (
                      !item.includes('node_modules') &&
                      !item.includes('pnpm-lock.yaml') &&
                      !item.includes('.DS_Store') &&
                      // Exclude Rust compilation files
                      !/packages[\\/]next-swc/.test(item)
                    )
                  },
                }
              )
            )
        }

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

        // log for clarity of which version we're using
        require('console').log({
          swcNativeDirectory: process.env.NEXT_TEST_NATIVE_DIR,
          swcWasmDirectory: process.env.NEXT_TEST_WASM_DIR,
        })

        pkgPaths = await rootSpan
          .traceChild('linkPackages')
          .traceAsyncFn((span) =>
            linkPackages({
              repoDir: tmpRepoDir,
              parentSpan: span,
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
            // Add resolutions if provided.
            ...(resolutions ? { resolutions } : {}),
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
        // This is what the next-rspack plugin does.
        // TODO: Load the plugin properly during test
        process.env.NEXT_RSPACK = 'true'
        process.env.RSPACK_CONFIG_VALIDATE = 'loose-silent'
      }

      return {
        installDir,
        pkgPaths,
        tmpRepoDir,
      }
    })
}

module.exports = {
  createNextInstall,
  getPkgPaths: linkPackages,
}
