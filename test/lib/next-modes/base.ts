import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import execa from 'execa'
import treeKill from 'tree-kill'
import { NextConfig } from 'next'
import { FileRef } from '../e2e-utils'
import childProcess, { ChildProcess } from 'child_process'
import {
  writeInitialFiles,
  initTemporalDirs,
  FilterFn,
} from '../create-test-dir-utils'

const { linkPackages } =
  require('../../../.github/actions/next-stats-action/src/prepare/repo-setup')()

type Event = 'stdout' | 'stderr' | 'error' | 'destroy'
export type InstallCommand =
  | string
  | ((ctx: { dependencies: { [key: string]: string } }) => string)

export type PackageJson = {
  dependencies?: { [key: string]: string }
  devDependencies?: { [key: string]: string }
  workspaces?: string[]
  [key: string]: unknown
}

interface NextInstanceOptsBase {
  files: FileRef | { [filename: string]: string | FileRef }
  dependencies?: { [name: string]: string }
  packageJson?: PackageJson
  packageLockPath?: string
  nextConfig?: NextConfig
  installCommand?: InstallCommand
  buildCommand?: string
  startCommand?: string
  env?: Record<string, string>
  dirSuffix?: string
  turbo?: boolean
}

export type NextInstanceOpts = NextInstanceOptsBase &
  (
    | {
        apps: string[]
        packages?: string[]
      }
    | { packages?: never }
  )

export class NextInstance {
  protected files: FileRef | { [filename: string]: string | FileRef }
  protected nextConfig?: NextConfig
  protected installCommand?: InstallCommand
  protected buildCommand?: string
  protected startCommand?: string
  protected dependencies?: PackageJson['dependencies'] = {}
  protected events: { [eventName: string]: Set<any> } = {}
  public testDir: string
  protected isStopping: boolean = false
  protected isDestroyed: boolean = false
  protected childProcess: ChildProcess
  protected _url: string
  protected _parsedUrl: URL
  protected packageJson?: PackageJson = {}
  protected packageLockPath?: string
  protected basePath?: string
  protected env?: Record<string, string>

  // Monorepos
  protected apps?: string[]
  protected packages?: string[]

  public forcedPort?: string
  public dirSuffix: string = ''

  constructor(opts: NextInstanceOpts) {
    Object.assign(this, opts)
  }

  protected async writeInitialFiles(
    skipPackageJsons = false,
    onPackageJson?: FilterFn
  ) {
    if (skipPackageJsons) {
      // Skip the root `package.json` and the ones in `this.apps` and `this.packages`
      const skipPaths = ['', ...this.apps, ...this.packages].map((p) =>
        path.join(this.testDir, p, 'package.json')
      )

      return writeInitialFiles(
        this.files,
        this.testDir,
        async (src, dest, content) => {
          if (skipPaths.includes(dest)) {
            return onPackageJson ? onPackageJson(src, dest, content) : false
          }
          return true
        }
      )
    }

    return writeInitialFiles(this.files, this.testDir)
  }

  protected async setupTestDir(dependencies: PackageJson['dependencies']) {
    const { installDir, tmpRepoDir } = await initTemporalDirs(this.dirSuffix)
    const packageJsons: [string, PackageJson][] = [
      [path.join(installDir, 'package.json'), this.packageJson],
    ]

    this.testDir = installDir

    let combinedDependencies = dependencies

    const skipLocalDeps = (pkgJson: PackageJson) =>
      !!(pkgJson && pkgJson.nextPrivateSkipLocalDeps)

    if (this.isMonorepo) {
      if (!this.packageJson?.devDependencies.turbo) {
        throw new Error(
          `"turbo" needs to be a dev dependency of the root package.json when testing monorepos`
        )
      }

      // For monorepos we need to write all the package.json's before installing deps, which
      // requires iterating over the files, so the files are written to the tmp directory earlier
      // and we'll find the package.json's in the process.
      await this.writeInitialFiles(true, async (src, dest, content) => {
        const packageJson = JSON.parse(
          content || (await fs.readFile(src, 'utf8'))
        )

        packageJsons.push([dest, packageJson])
        return false
      })
    }

    if (packageJsons.some(([, packageJson]) => !skipLocalDeps(packageJson))) {
      const pkgPaths = await linkPackages(tmpRepoDir)

      combinedDependencies = {
        next: pkgPaths.get('next'),
        ...Object.keys(dependencies).reduce((prev, pkg) => {
          const pkgPath = pkgPaths.get(pkg)
          prev[pkg] = pkgPath || dependencies[pkg]
          return prev
        }, {}),
      }
    }

    for (const [dest, packageJson] of packageJsons) {
      await fs.ensureDir(path.dirname(dest))
      await fs.writeFile(
        dest,
        JSON.stringify(
          packageJson?.devDependencies?.turbo
            ? // Don't modify the dependencies in the monorepo's package.json,
              // since it won't include next or react
              packageJson
            : {
                ...packageJson,
                dependencies: {
                  ...packageJson?.dependencies,
                  ...(skipLocalDeps(packageJson)
                    ? dependencies
                    : combinedDependencies),
                },
                private: true,
              },
          null,
          2
        )
      )
    }

    if (this.packageLockPath) {
      await fs.copy(
        this.packageLockPath,
        path.join(installDir, path.basename(this.packageLockPath))
      )
    }

    if (this.installCommand) {
      const installString =
        typeof this.installCommand === 'function'
          ? this.installCommand({ dependencies: combinedDependencies })
          : this.installCommand

      require('console').log('running install command', installString)

      childProcess.execSync(installString, {
        cwd: installDir,
        stdio: ['ignore', 'inherit', 'inherit'],
      })
    } else {
      await execa('pnpm', ['install', '--strict-peer-dependencies=false'], {
        cwd: installDir,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: process.env,
      })
    }

    await fs.remove(tmpRepoDir)
  }

  protected async createTestDir({
    skipInstall = false,
  }: { skipInstall?: boolean } = {}) {
    if (this.isDestroyed) {
      throw new Error('next instance already destroyed')
    }
    require('console').log(`Creating test directory with isolated next...`)

    const skipIsolatedNext = !!process.env.NEXT_SKIP_ISOLATE
    const tmpDir = skipIsolatedNext
      ? path.join(__dirname, '../../tmp')
      : process.env.NEXT_TEST_DIR || (await fs.realpath(os.tmpdir()))
    this.testDir = path.join(
      tmpDir,
      `next-test-${Date.now()}-${(Math.random() * 1000) | 0}${this.dirSuffix}`
    )

    const reactVersion = process.env.NEXT_TEST_REACT_VERSION || 'latest'
    const finalDependencies = {
      react: reactVersion,
      'react-dom': reactVersion,
      ...this.dependencies,
      ...this.packageJson?.dependencies,
    }

    if (skipInstall) {
      const pkgScripts = (this.packageJson['scripts'] as {}) || {}
      await fs.ensureDir(this.testDir)
      await fs.writeFile(
        path.join(this.testDir, 'package.json'),
        JSON.stringify(
          {
            ...this.packageJson,
            dependencies: {
              ...finalDependencies,
              next:
                process.env.NEXT_TEST_VERSION ||
                require('next/package.json').version,
            },
            scripts: {
              ...pkgScripts,
              build:
                (pkgScripts['build'] || this.buildCommand || 'next build') +
                ' && yarn post-build',
              // since we can't get the build id as a build artifact, make it
              // available under the static files
              'post-build': 'cp .next/BUILD_ID .next/static/__BUILD_ID',
            },
          },
          null,
          2
        )
      )
    } else {
      if (
        process.env.NEXT_TEST_STARTER &&
        !this.dependencies &&
        !this.installCommand &&
        !this.packageJson &&
        !this.isMonorepo &&
        !(global as any).isNextDeploy
      ) {
        await fs.copy(process.env.NEXT_TEST_STARTER, this.testDir)
      } else if (!skipIsolatedNext) {
        await this.setupTestDir(finalDependencies)
        require('console').log('created next.js install, writing test files')
      }
    }

    if (!this.isMonorepo) {
      await this.writeInitialFiles()
    }

    const apps = this.apps || ['']

    for (const app of apps) {
      let nextConfigFile = Object.keys(this.files).find((file) =>
        file.startsWith(path.join(app, 'next.config.'))
      )

      if (await fs.pathExists(path.join(this.testDir, app, 'next.config.js'))) {
        nextConfigFile = 'next.config.js'
      }

      if (nextConfigFile && this.nextConfig) {
        throw new Error(
          `nextConfig provided on "createNext()" and as a file "${nextConfigFile}", use one or the other to continue`
        )
      }

      if (
        this.nextConfig ||
        ((global as any).isNextDeploy && !nextConfigFile)
      ) {
        const functions = []

        await fs.writeFile(
          path.join(this.testDir, app, 'next.config.js'),
          `
        module.exports = ` +
            JSON.stringify(
              {
                ...this.nextConfig,
              } as NextConfig,
              (key, val) => {
                if (typeof val === 'function') {
                  functions.push(
                    val
                      .toString()
                      .replace(
                        new RegExp(`${val.name}[\\s]{0,}\\(`),
                        'function('
                      )
                  )
                  return `__func_${functions.length - 1}`
                }
                return val
              },
              2
            ).replace(/"__func_[\d]{1,}"/g, function (str) {
              return functions.shift()
            })
        )
      }

      if ((global as any).isNextDeploy) {
        const fileName = path.join(
          this.testDir,
          app,
          nextConfigFile || 'next.config.js'
        )
        const content = await fs.readFile(fileName, 'utf8')

        if (content.includes('basePath')) {
          this.basePath =
            content.match(/['"`]?basePath['"`]?:.*?['"`](.*?)['"`]/)?.[1] || ''
        }

        await fs.writeFile(
          fileName,
          `${content}\n` +
            `
          // alias __NEXT_TEST_MODE for next-deploy as "_" is not a valid
          // env variable during deploy
          if (process.env.NEXT_PRIVATE_TEST_MODE) {
            process.env.__NEXT_TEST_MODE = process.env.NEXT_PRIVATE_TEST_MODE
          }
        `
        )
      }
    }
    require('console').log(`Test directory created at ${this.testDir}`)
  }

  public async clean() {
    if (this.childProcess) {
      throw new Error(`stop() must be called before cleaning`)
    }

    const keptFiles = [
      'node_modules',
      'package.json',
      'yarn.lock',
      'pnpnm-workspace.yaml',
    ]
    const clean = async (dir: string) => {
      for (const file of await fs.readdir(dir)) {
        if (
          this.apps?.some((app) => app.startsWith(file)) ||
          this.packages?.some((pkg) => pkg.startsWith(file))
        ) {
          await clean(path.join(dir, file))
        } else if (!keptFiles.includes(file)) {
          await fs.remove(path.join(this.testDir, file))
        }
      }
    }

    await clean(this.testDir)
    await this.writeInitialFiles(this.isMonorepo)
  }

  public async export(): Promise<{ exitCode?: number; cliOutput?: string }> {
    return {}
  }
  public async setup(): Promise<void> {}
  public async start(useDirArg: boolean = false): Promise<void> {}
  public async stop(): Promise<void> {
    this.isStopping = true
    if (this.childProcess) {
      let exitResolve
      const exitPromise = new Promise((resolve) => {
        exitResolve = resolve
      })
      this.childProcess.addListener('exit', () => {
        exitResolve()
      })
      await new Promise<void>((resolve) => {
        treeKill(this.childProcess.pid, 'SIGKILL', (err) => {
          if (err) {
            require('console').error('tree-kill', err)
          }
          resolve()
        })
      })
      this.childProcess.kill('SIGKILL')
      await exitPromise
      this.childProcess = undefined
      require('console').log(`Stopped next server`)
    }
  }

  public async destroy(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error(`next instance already destroyed`)
    }
    this.isDestroyed = true
    this.emit('destroy', [])
    await this.stop()

    if (process.env.TRACE_PLAYWRIGHT) {
      await fs
        .copy(
          path.join(this.testDir, '.next/trace'),
          path.join(
            __dirname,
            '../../traces',
            `${path
              .relative(
                path.join(__dirname, '../../'),
                process.env.TEST_FILE_PATH
              )
              .replace(/\//g, '-')}`,
            `next-trace`
          )
        )
        .catch(() => {})
    }

    if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
      await fs.remove(this.testDir)
    }
    require('console').log(`destroyed next instance`)
  }

  protected get isMonorepo() {
    return !!(this.apps?.length || this.packages?.length)
  }

  public get url() {
    return this._url
  }

  public get appPort() {
    return this._parsedUrl.port
  }

  public get buildId(): string {
    return ''
  }

  public get cliOutput(): string {
    return ''
  }

  // TODO: block these in deploy mode
  public async readFile(filename: string) {
    return fs.readFile(path.join(this.testDir, filename), 'utf8')
  }
  public async patchFile(filename: string, content: string) {
    const outputPath = path.join(this.testDir, filename)
    await fs.ensureDir(path.dirname(outputPath))
    return fs.writeFile(outputPath, content)
  }
  public async renameFile(filename: string, newFilename: string) {
    return fs.rename(
      path.join(this.testDir, filename),
      path.join(this.testDir, newFilename)
    )
  }
  public async deleteFile(filename: string) {
    return fs.remove(path.join(this.testDir, filename))
  }

  public on(event: Event, cb: (...args: any[]) => any) {
    if (!this.events[event]) {
      this.events[event] = new Set()
    }
    this.events[event].add(cb)
  }

  public off(event: Event, cb: (...args: any[]) => any) {
    this.events[event]?.delete(cb)
  }

  protected emit(event: Event, args: any[]) {
    this.events[event]?.forEach((cb) => {
      cb(...args)
    })
  }
}
