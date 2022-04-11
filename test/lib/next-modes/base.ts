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
  protected files: {
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

  constructor({
    files,
    dependencies,
    nextConfig,
    installCommand,
    buildCommand,
    startCommand,
    packageJson = {},
  }: {
    files: {
      [filename: string]: string | FileRef
    }
    dependencies?: {
      [name: string]: string
    }
    packageJson?: PackageJson
    nextConfig?: NextConfig
    installCommand?: InstallCommand
    buildCommand?: string
    startCommand?: string
  }) {
    this.files = files
    this.dependencies = dependencies
    this.nextConfig = nextConfig
    this.installCommand = installCommand
    this.buildCommand = buildCommand
    this.startCommand = startCommand
    this.packageJson = packageJson
    this.events = {}
    this.isDestroyed = false
    this.isStopping = false
  }

  protected async createTestDir() {
    if (this.isDestroyed) {
      throw new Error('next instance already destroyed')
    }
    console.log(`Creating test directory with isolated next...`)

    const skipIsolatedNext = !!process.env.NEXT_SKIP_ISOLATE
    const tmpDir = skipIsolatedNext
      ? path.join(__dirname, '../../tmp')
      : process.env.NEXT_TEST_DIR || (await fs.realpath(os.tmpdir()))
    this.testDir = path.join(
      tmpDir,
      `next-test-${Date.now()}-${(Math.random() * 1000) | 0}`
    )

    if (
      process.env.NEXT_TEST_STARTER &&
      !this.dependencies &&
      !this.installCommand
    ) {
      await fs.copy(process.env.NEXT_TEST_STARTER, this.testDir)
    } else if (!skipIsolatedNext) {
      const reactVersion = process.env.NEXT_TEST_REACT_VERSION || 'latest'
      const finalDependencies = {
        react: reactVersion,
        'react-dom': reactVersion,
        ...this.dependencies,
        ...((this.packageJson.dependencies as object | undefined) || {}),
      }
      this.testDir = await createNextInstall(
        finalDependencies,
        this.installCommand,
        this.packageJson
      )
    }
    console.log('created next.js install, writing test files')

    for (const filename of Object.keys(this.files)) {
      const item = this.files[filename]
      const outputfilename = path.join(this.testDir, filename)

      if (typeof item === 'string') {
        await fs.ensureDir(path.dirname(outputfilename))
        await fs.writeFile(outputfilename, item)
      } else {
        await fs.copy(item.fsPath, outputfilename)
      }
    }

    if (this.nextConfig) {
      const functions = []

      await fs.writeFile(
        path.join(this.testDir, 'next.config.js'),
        'module.exports = ' +
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

    console.log(`Test directory created at ${this.testDir}`)
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
  public async start(): Promise<void> {}
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
            console.error('tree-kill', err)
          }
          resolve()
        })
      })
      this.childProcess.kill('SIGKILL')
      await exitPromise
      this.childProcess = undefined
      console.log(`Stopped next server`)
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
    console.log(`destroyed next instance`)
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
