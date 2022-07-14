import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import treeKill from 'tree-kill'
import { NextConfig } from 'next'
import { FileRef } from '../e2e-utils'
import { ChildProcess } from 'child_process'
import { createNextInstall } from '../create-next-install'

type Event = 'stdout' | 'stderr' | 'error' | 'destroy'
export type InstallCommand =
  | string
  | ((ctx: { dependencies: { [key: string]: string } }) => string)

export type PackageJson = {
  [key: string]: unknown
}
export class NextInstance {
  protected files:
    | FileRef
    | {
        [filename: string]: string | FileRef
      }
  protected nextConfig?: NextConfig
  protected installCommand?: InstallCommand
  protected buildCommand?: string
  protected startCommand?: string
  protected dependencies?: { [name: string]: string }
  protected events: { [eventName: string]: Set<any> }
  public testDir: string
  protected isStopping: boolean
  protected isDestroyed: boolean
  protected childProcess: ChildProcess
  protected _url: string
  protected _parsedUrl: URL
  protected packageJson: PackageJson
  protected packageLockPath?: string
  protected basePath?: string
  protected env?: Record<string, string>
  public forcedPort?: string

  constructor({
    files,
    dependencies,
    nextConfig,
    installCommand,
    buildCommand,
    startCommand,
    packageJson = {},
    packageLockPath,
    env,
  }: {
    files:
      | FileRef
      | {
          [filename: string]: string | FileRef
        }
    dependencies?: {
      [name: string]: string
    }
    packageJson?: PackageJson
    packageLockPath?: string
    nextConfig?: NextConfig
    installCommand?: InstallCommand
    buildCommand?: string
    startCommand?: string
    env?: Record<string, string>
  }) {
    this.files = files
    this.dependencies = dependencies
    this.nextConfig = nextConfig
    this.installCommand = installCommand
    this.buildCommand = buildCommand
    this.startCommand = startCommand
    this.packageJson = packageJson
    this.packageLockPath = packageLockPath
    this.events = {}
    this.isDestroyed = false
    this.isStopping = false
    this.env = env
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
      `next-test-${Date.now()}-${(Math.random() * 1000) | 0}`
    )

    const reactVersion = process.env.NEXT_TEST_REACT_VERSION || 'latest'
    const finalDependencies = {
      react: reactVersion,
      'react-dom': reactVersion,
      ...this.dependencies,
      ...((this.packageJson.dependencies as object | undefined) || {}),
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
        !(global as any).isNextDeploy
      ) {
        await fs.copy(process.env.NEXT_TEST_STARTER, this.testDir)
      } else if (!skipIsolatedNext) {
        this.testDir = await createNextInstall(
          finalDependencies,
          this.installCommand,
          this.packageJson,
          this.packageLockPath
        )
      }
      require('console').log('created next.js install, writing test files')
    }

    if (this.files instanceof FileRef) {
      // if a FileRef is passed directly to `files` we copy the
      // entire folder to the test directory
      const stats = await fs.stat(this.files.fsPath)

      if (!stats.isDirectory()) {
        throw new Error(
          `FileRef passed to "files" in "createNext" is not a directory ${this.files.fsPath}`
        )
      }
      await fs.copy(this.files.fsPath, this.testDir)
    } else {
      for (const filename of Object.keys(this.files)) {
        const item = this.files[filename]
        const outputFilename = path.join(this.testDir, filename)

        if (typeof item === 'string') {
          await fs.ensureDir(path.dirname(outputFilename))
          await fs.writeFile(outputFilename, item)
        } else {
          await fs.copy(item.fsPath, outputFilename)
        }
      }
    }

    const nextConfigFile = Object.keys(this.files).find((file) =>
      file.startsWith('next.config.')
    )

    if (nextConfigFile && this.nextConfig) {
      throw new Error(
        `nextConfig provided on "createNext()" and as a file "${nextConfigFile}", use one or the other to continue`
      )
    }

    if (this.nextConfig || ((global as any).isNextDeploy && !nextConfigFile)) {
      const functions = []

      await fs.writeFile(
        path.join(this.testDir, 'next.config.js'),
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
                    .replace(new RegExp(`${val.name}[\\s]{0,}\\(`), 'function(')
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
    require('console').log(`Test directory created at ${this.testDir}`)
  }

  public async clean() {
    if (this.childProcess) {
      throw new Error(`stop() must be called before cleaning`)
    }

    const keptFiles = ['node_modules', 'package.json', 'yarn.lock']
    for (const file of await fs.readdir(this.testDir)) {
      if (!keptFiles.includes(file)) {
        await fs.remove(path.join(this.testDir, file))
      }
    }
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
