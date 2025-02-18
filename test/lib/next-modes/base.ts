import os from 'os'
import path from 'path'
import { existsSync, promises as fs, rmSync, readFileSync } from 'fs'
import treeKill from 'tree-kill'
import type { NextConfig } from 'next'
import { FileRef, isNextDeploy } from '../e2e-utils'
import { ChildProcess } from 'child_process'
import { createNextInstall } from '../create-next-install'
import { Span } from 'next/dist/trace'
import webdriver from '../next-webdriver'
import { renderViaHTTP, fetchViaHTTP, findPort } from 'next-test-utils'
import cheerio from 'cheerio'
import { once } from 'events'
import { BrowserInterface } from '../browsers/base'
import escapeStringRegexp from 'escape-string-regexp'

type Event = 'stdout' | 'stderr' | 'error' | 'destroy'
export type InstallCommand =
  | string
  | ((ctx: { dependencies: { [key: string]: string } }) => string)

export type PackageJson = {
  dependencies?: { [key: string]: string }
  [key: string]: unknown
}

type ResolvedFileConfig = FileRef | { [filename: string]: string | FileRef }
type FilesConfig = ResolvedFileConfig | string
export interface NextInstanceOpts {
  files: FilesConfig
  overrideFiles?: FilesConfig
  dependencies?: { [name: string]: string }
  resolutions?: { [name: string]: string }
  packageJson?: PackageJson
  nextConfig?: NextConfig
  installCommand?: InstallCommand
  buildCommand?: string
  buildOptions?: string[]
  startCommand?: string
  startOptions?: string[]
  env?: Record<string, string>
  dirSuffix?: string
  turbo?: boolean
  forcedPort?: string
  serverReadyPattern?: RegExp
  patchFileDelay?: number
}

/**
 * Omit the first argument of a function
 */
type OmitFirstArgument<F> = F extends (
  firstArgument: any,
  ...args: infer P
) => infer R
  ? (...args: P) => R
  : never

// Do not rename or format. sync-react script relies on this line.
// prettier-ignore
const nextjsReactPeerVersion = "^19.0.0";

export class NextInstance {
  protected files: ResolvedFileConfig
  protected overrideFiles: ResolvedFileConfig
  protected nextConfig?: NextConfig
  protected installCommand?: InstallCommand
  protected buildCommand?: string
  protected buildOptions?: string
  protected startCommand?: string
  protected startOptions?: string[]
  protected dependencies?: PackageJson['dependencies'] = {}
  protected resolutions?: PackageJson['resolutions']
  protected events: { [eventName: string]: Set<any> } = {}
  public testDir: string
  tmpRepoDir: string
  protected isStopping: boolean = false
  protected isDestroyed: boolean = false
  protected childProcess?: ChildProcess
  protected _url: string
  protected _parsedUrl: URL
  protected packageJson?: PackageJson = {}
  protected basePath?: string
  public env: Record<string, string>
  public forcedPort?: string
  public dirSuffix: string = ''
  public serverReadyPattern?: RegExp = / ✓ Ready in /
  patchFileDelay: number = 0

  constructor(opts: NextInstanceOpts) {
    this.env = {}
    Object.assign(this, opts)

    if (!isNextDeploy) {
      this.env = {
        ...this.env,
        // remove node_modules/.bin repo path from env
        // to match CI $PATH value and isolate further
        PATH: process.env.PATH.split(path.delimiter)
          .filter((part) => {
            return !part.includes(path.join('node_modules', '.bin'))
          })
          .join(path.delimiter),
      }
    }
  }

  private async writeFiles(filesConfig: FilesConfig, testDir: string) {
    // Handle case where files is a directory string
    const files =
      typeof filesConfig === 'string' ? new FileRef(filesConfig) : filesConfig
    if (files instanceof FileRef) {
      // if a FileRef is passed directly to `files` we copy the
      // entire folder to the test directory
      const stats = await fs.stat(files.fsPath)

      if (!stats.isDirectory()) {
        throw new Error(
          `FileRef passed to "files" in "createNext" is not a directory ${files.fsPath}`
        )
      }

      await fs.cp(files.fsPath, testDir, {
        recursive: true,
        filter(source) {
          // we don't copy a package.json as it's manually written
          // via the createNextInstall process
          if (path.relative(files.fsPath, source) === 'package.json') {
            return false
          }
          return true
        },
      })
    } else {
      for (const filename of Object.keys(files)) {
        const item = files[filename]
        const outputFilename = path.join(testDir, filename)

        if (typeof item === 'string') {
          await fs.mkdir(path.dirname(outputFilename), { recursive: true })
          await fs.writeFile(outputFilename, item)
        } else {
          await fs.cp(item.fsPath, outputFilename, { recursive: true })
        }
      }
    }
  }

  protected async writeInitialFiles() {
    return this.writeFiles(this.files, this.testDir)
  }

  protected async writeOverrideFiles() {
    if (this.overrideFiles) {
      return this.writeFiles(this.overrideFiles, this.testDir)
    }
  }

  protected async beforeInstall(parentSpan: Span) {
    await parentSpan.traceChild('writeInitialFiles').traceAsyncFn(async () => {
      await this.writeInitialFiles()
    })

    await parentSpan.traceChild('writeOverrideFiles').traceAsyncFn(async () => {
      await this.writeOverrideFiles()
    })
  }

  protected async createTestDir({
    skipInstall = false,
    parentSpan,
  }: {
    skipInstall?: boolean
    parentSpan: Span
  }) {
    if (this.isDestroyed) {
      throw new Error('next instance already destroyed')
    }

    await parentSpan
      .traceChild('createTestDir')
      .traceAsyncFn(async (rootSpan) => {
        const skipIsolatedNext = !!process.env.NEXT_SKIP_ISOLATE
        if (!skipIsolatedNext) {
          require('console').log(
            `Creating test directory with isolated next... (use NEXT_SKIP_ISOLATE=1 to opt-out)`
          )
        }
        const tmpDir = skipIsolatedNext
          ? path.join(__dirname, '../../tmp')
          : process.env.NEXT_TEST_DIR || (await fs.realpath(os.tmpdir()))
        this.testDir = path.join(
          tmpDir,
          `next-test-${Date.now()}-${(Math.random() * 1000) | 0}${
            this.dirSuffix
          }`
        )

        const reactVersion =
          process.env.NEXT_TEST_REACT_VERSION || nextjsReactPeerVersion
        const finalDependencies = {
          react: reactVersion,
          'react-dom': reactVersion,
          '@types/react': 'latest',
          '@types/react-dom': 'latest',
          typescript: 'latest',
          '@types/node': 'latest',
          ...this.dependencies,
          ...this.packageJson?.dependencies,
        }

        if (skipInstall || skipIsolatedNext) {
          const pkgScripts = (this.packageJson['scripts'] as {}) || {}
          await fs.mkdir(this.testDir, { recursive: true })
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
                ...(this.resolutions ? { resolutions: this.resolutions } : {}),
                scripts: {
                  // since we can't get the build id as a build artifact, make it
                  // available under the static files
                  'post-build': 'cp .next/BUILD_ID .next/static/__BUILD_ID',
                  ...pkgScripts,
                  build:
                    (pkgScripts['build'] || this.buildCommand || 'next build') +
                    ' && pnpm post-build',
                },
              },
              null,
              2
            )
          )

          await this.beforeInstall(parentSpan)
        } else {
          if (
            process.env.NEXT_TEST_STARTER &&
            !this.dependencies &&
            !this.installCommand &&
            !this.packageJson &&
            !isNextDeploy
          ) {
            await fs.cp(process.env.NEXT_TEST_STARTER, this.testDir, {
              recursive: true,
            })

            require('console').log(
              'created next.js install, writing test files'
            )
            await this.beforeInstall(parentSpan)
          } else {
            const { tmpRepoDir } = await createNextInstall({
              parentSpan: rootSpan,
              dependencies: finalDependencies,
              resolutions: this.resolutions ?? null,
              installCommand: this.installCommand,
              packageJson: this.packageJson,
              dirSuffix: this.dirSuffix,
              keepRepoDir: true,
              beforeInstall: async (span, installDir) => {
                this.testDir = installDir
                require('console').log(
                  'created next.js install, writing test files'
                )
                await this.beforeInstall(span)
              },
            })
            this.tmpRepoDir = tmpRepoDir
          }
        }

        const testDirFiles = await fs.readdir(this.testDir)

        let nextConfigFile = testDirFiles.find((file) =>
          file.startsWith('next.config.')
        )

        if (nextConfigFile && this.nextConfig) {
          throw new Error(
            `nextConfig provided on "createNext()" and as a file "${nextConfigFile}", use one or the other to continue`
          )
        }

        if (this.nextConfig || (isNextDeploy && !nextConfigFile)) {
          const functions = []
          const exportDeclare =
            this.packageJson?.type === 'module'
              ? 'export default'
              : 'module.exports = '
          await fs.writeFile(
            path.join(this.testDir, 'next.config.js'),
            exportDeclare +
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

        if (isNextDeploy) {
          const fileName = path.join(
            this.testDir,
            nextConfigFile || 'next.config.js'
          )
          const content = await fs.readFile(fileName, 'utf8')

          if (content.includes('basePath')) {
            this.basePath =
              content.match(/['"`]?basePath['"`]?:.*?['"`](.*?)['"`]/)?.[1] ||
              ''
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

          if (
            testDirFiles.includes('node_modules') &&
            !testDirFiles.includes('vercel.json')
          ) {
            // Tests that include a patched node_modules dir won't automatically be uploaded to Vercel.
            // We need to ensure node_modules is not excluded from the deploy files, and tweak the
            // start + build commands to handle copying the patched node modules into the final.
            // To be extra safe, we only do this if the test directory doesn't already have a custom vercel.json
            require('console').log(
              'Detected node_modules in the test directory, writing `vercel.json` and `.vercelignore` to ensure its included.'
            )

            await fs.writeFile(
              path.join(this.testDir, 'vercel.json'),
              JSON.stringify({
                installCommand:
                  'mv node_modules node_modules.bak && npm i && cp -r node_modules.bak/* node_modules',
              })
            )

            await fs.writeFile(
              path.join(this.testDir, '.vercelignore'),
              '!node_modules'
            )
          }
        }
      })
  }

  protected setServerReadyTimeout(
    reject: (reason?: unknown) => void,
    ms = 10_000
  ): NodeJS.Timeout {
    return setTimeout(() => {
      reject(
        new Error(
          `Failed to start server after ${ms}ms, waiting for this log pattern: ${this.serverReadyPattern}`
        )
      )
    }, ms)
  }

  // normalize snapshots or stack traces being tested
  // to a consistent test dir value since it's random
  public normalizeTestDirContent(content) {
    content = content.replace(
      new RegExp(escapeStringRegexp(this.testDir), 'g'),
      'TEST_DIR'
    )
    return content
  }

  public async clean() {
    if (this.childProcess) {
      throw new Error(`stop() must be called before cleaning`)
    }

    const keptFiles = [
      'node_modules',
      'package.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ]
    for (const file of await fs.readdir(this.testDir)) {
      if (!keptFiles.includes(file)) {
        await fs.rm(path.join(this.testDir, file), {
          recursive: true,
          force: true,
        })
      }
    }
    await this.writeInitialFiles()
  }

  public async build(): Promise<{ exitCode?: number; cliOutput?: string }> {
    throw new Error('Not implemented')
  }

  public async setup(parentSpan: Span): Promise<void> {
    if (this.forcedPort === 'random') {
      this.forcedPort = (await findPort()) + ''
      console.log('Forced random port:', this.forcedPort)
    }
  }

  public async start(useDirArg: boolean = false): Promise<void> {}

  public async stop(
    signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL' = 'SIGKILL'
  ): Promise<void> {
    if (this.childProcess) {
      if (this.isStopping) {
        // warn for debugging, but don't prevent sending two signals in succession
        // (e.g. SIGINT and then SIGKILL)
        require('console').error(
          `Next server is already being stopped (received signal: ${signal})`
        )
      }
      this.isStopping = true
      const closePromise = once(this.childProcess, 'close')
      await new Promise<void>((resolve) => {
        treeKill(this.childProcess.pid, signal, (err) => {
          if (err) {
            require('console').error('tree-kill', err)
          }
          resolve()
        })
      })
      this.childProcess.kill(signal)
      await closePromise
      this.childProcess = undefined
      this.isStopping = false
      require('console').log(`Stopped next server`)
    }
  }

  public async destroy(): Promise<void> {
    try {
      require('console').time('destroyed next instance')

      if (this.isDestroyed) {
        throw new Error(`next instance already destroyed`)
      }
      this.isDestroyed = true
      this.emit('destroy', [])
      await this.stop().catch(console.error)

      if (process.env.TRACE_PLAYWRIGHT) {
        await fs
          .cp(
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
            ),
            { recursive: true }
          )
          .catch((e) => {
            require('console').error(e)
          })
      }

      if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
        // Faster than `await fs.rm`. Benchmark before change.
        rmSync(this.testDir, { recursive: true, force: true })
        if (this.tmpRepoDir) {
          rmSync(this.tmpRepoDir, { recursive: true, force: true })
        }
      }
      require('console').timeEnd(`destroyed next instance`)
    } catch (err) {
      require('console').error('Error while destroying', err)
    }
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
  public async hasFile(filename: string) {
    return existsSync(path.join(this.testDir, filename))
  }

  public async readFile(filename: string) {
    return fs.readFile(path.join(this.testDir, filename), 'utf8')
  }

  public readFileSync(filename: string) {
    return readFileSync(path.join(this.testDir, filename), 'utf8')
  }

  public async readJSON(filename: string) {
    return JSON.parse(
      await fs.readFile(path.join(this.testDir, filename), 'utf-8')
    )
  }

  public async remove(fileOrDirPath: string) {
    await fs.rm(path.join(this.testDir, fileOrDirPath), {
      recursive: true,
      force: true,
    })
  }

  public async patchFile(
    filename: string,
    content: string | ((content: string) => string),
    runWithTempContent?: (context: { newFile: boolean }) => Promise<void>
  ): Promise<{ newFile: boolean }> {
    const outputPath = path.join(this.testDir, filename)
    const newFile = !existsSync(outputPath)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    const previousContent = newFile ? undefined : await this.readFile(filename)

    await fs.writeFile(
      outputPath,
      typeof content === 'function' ? content(previousContent) : content,
      {
        flush: true,
      }
    )

    if (runWithTempContent) {
      try {
        await runWithTempContent({ newFile })
      } finally {
        if (previousContent === undefined) {
          await fs.rm(outputPath)
        } else {
          await fs.writeFile(outputPath, previousContent, {
            flush: true,
          })
        }
      }
    }

    return { newFile }
  }

  public async renameFile(filename: string, newFilename: string) {
    await fs.rename(
      path.join(this.testDir, filename),
      path.join(this.testDir, newFilename)
    )
  }

  public async renameFolder(foldername: string, newFoldername: string) {
    await fs.rename(
      path.join(this.testDir, foldername),
      path.join(this.testDir, newFoldername)
    )
  }

  public async deleteFile(filename: string) {
    await fs.rm(path.join(this.testDir, filename), {
      recursive: true,
      force: true,
    })
  }

  /**
   * Create new browser window for the Next.js app.
   */
  public async browser(
    ...args: Parameters<OmitFirstArgument<typeof webdriver>>
  ): Promise<BrowserInterface> {
    return webdriver(this.url, ...args)
  }

  /**
   * Fetch the HTML for the provided page. This is a shortcut for `renderViaHTTP().then(html => cheerio.load(html))`.
   */
  public async render$(
    ...args: Parameters<OmitFirstArgument<typeof renderViaHTTP>>
  ): Promise<ReturnType<typeof cheerio.load>> {
    const html = await renderViaHTTP(this.url, ...args)
    return cheerio.load(html)
  }

  /**
   * Fetch the HTML for the provided page. This is a shortcut for `fetchViaHTTP().then(res => res.text())`.
   */
  public async render(
    ...args: Parameters<OmitFirstArgument<typeof renderViaHTTP>>
  ) {
    return renderViaHTTP(this.url, ...args)
  }

  /**
   * Performs a fetch request to the NextInstance with the options provided.
   *
   * @param pathname the pathname on the NextInstance to fetch
   * @param opts the optional options to pass to the underlying fetch
   * @returns the fetch response
   */
  public async fetch(
    pathname: string,
    opts?: import('node-fetch').RequestInit
  ) {
    return fetchViaHTTP(this.url, pathname, null, opts)
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

  public getCliOutputFromHere() {
    const length = this.cliOutput.length
    return () => {
      return this.cliOutput.slice(length)
    }
  }
}
