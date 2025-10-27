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
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  getDistDir,
} from 'next-test-utils'
import cheerio from 'cheerio'
import { once } from 'events'
import { Playwright } from 'next-webdriver'
import escapeStringRegexp from 'escape-string-regexp'
import { Page, Response } from 'playwright'

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
  buildArgs?: string[]
  startCommand?: string
  startArgs?: string[]
  env?: Record<string, string>
  subDir?: string
  turbo?: boolean
  forcedPort?: string
  serverReadyPattern?: RegExp
  patchFileDelay?: number
  startServerTimeout?: number
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
const nextjsReactPeerVersion = "19.2.0";

export class NextInstance {
  protected files: ResolvedFileConfig
  protected overrideFiles: ResolvedFileConfig
  protected nextConfig?: NextConfig
  protected installCommand?: InstallCommand
  public buildCommand?: string
  public buildArgs?: string[]
  protected startCommand?: string
  protected startArgs?: string[]
  protected dependencies?: PackageJson['dependencies'] = {}
  protected resolutions?: PackageJson['resolutions']
  protected events: { [eventName: string]: Set<any> } = {}
  public testDir: string
  public distDir: string
  tmpRepoDir: string
  protected isStopping: boolean = false
  protected isDestroyed: boolean = false
  protected childProcess?: ChildProcess
  protected _url: string
  protected _parsedUrl: URL
  protected packageJson: PackageJson = {}
  protected basePath?: string
  public env: Record<string, string>
  public forcedPort?: string
  public subDir: string = ''
  public startServerTimeout: number = 10_000 // 10 seconds
  public serverReadyPattern: RegExp = / ✓ Ready in /
  patchFileDelay: number = 0

  constructor(opts: NextInstanceOpts) {
    this.env = {}
    Object.assign(this, opts)

    if (!isNextDeploy) {
      this.env = {
        ...this.env,
        // remove node_modules/.bin repo path from env
        // to match CI $PATH value and isolate further
        PATH: process.env
          .PATH!.split(path.delimiter)
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
        // By default Node.js turns relative symlinks into absolute symlinks.
        // We don't want absolute symlinks because the test directory is isolated
        // and the symlink would turn into a path to the Next.js repo original file.
        // Setting this option to `true` will keep the symlink relative. Ensuring it's isolated.
        // See https://nodejs.org/api/fs.html#fscpsrc-dest-options-callback
        verbatimSymlinks: true,
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
          `next-test-${Date.now()}-${(Math.random() * 1000) | 0}`,
          this.subDir
        )
        this.distDir = getDistDir()

        const reactVersion =
          process.env.NEXT_TEST_REACT_VERSION || nextjsReactPeerVersion
        const finalDependencies = {
          react: reactVersion,
          'react-dom': reactVersion,
          '@types/react': '19.2.2',
          '@types/react-dom': '19.2.1',
          typescript: 'latest',
          '@types/node': 'latest',
          ...this.dependencies,
          ...this.packageJson?.dependencies,
        }

        if (
          process.env.__NEXT_ENABLE_REACT_COMPILER === 'true' &&
          !finalDependencies['babel-plugin-react-compiler']
        ) {
          finalDependencies['babel-plugin-react-compiler'] =
            '0.0.0-experimental-3fde738-20250918'
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
                  'post-build': `cp ${this.distDir}/BUILD_ID ${this.distDir}/static/__BUILD_ID`,
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
              subDir: this.subDir,
              keepRepoDir: true,
              beforeInstall: async (span, installDir) => {
                this.testDir = installDir
                require('console').log(
                  'created next.js install, writing test files'
                )
                await this.beforeInstall(span)
              },
            })
            this.tmpRepoDir = tmpRepoDir!
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

        if (this.nextConfig?.distDir) {
          this.distDir = this.nextConfig.distDir
        }
        // Same logic as we get the basePath in isNextDeploy
        if (nextConfigFile) {
          const content = await fs.readFile(
            path.join(this.testDir, nextConfigFile),
            'utf8'
          )
          if (content.includes('distDir')) {
            const match = content.match(
              /['"`]?distDir['"`]?:.*?['"`](.*?)['"`]/
            )?.[1]
            if (match) {
              this.distDir = match
            }
          }
        }

        if (this.nextConfig || (isNextDeploy && !nextConfigFile)) {
          const functions: string[] = []
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
                (key, val: unknown) => {
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
                return functions.shift()!
              })
          )
        }

        const tsConfigTestFile = testDirFiles.find(
          (file) => file === 'tsconfig.test.json'
        )
        if (tsConfigTestFile) {
          require('console').log(
            'tsconfig.test.json found, using it for this test'
          )
          await fs.copyFile(
            path.join(this.testDir, 'tsconfig.test.json'),
            path.join(this.testDir, 'tsconfig.json')
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

          // alias experimental feature flags for deployment compatibility
          if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS) {
            process.env.__NEXT_CACHE_COMPONENTS = process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS
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
    ms: number
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

  public async build(options?: {
    env?: Record<string, string>
    args?: string[]
  }): Promise<{
    exitCode: NodeJS.Signals | number | null
    cliOutput: string
  }> {
    throw new Error('Not implemented')
  }

  public async setup(parentSpan: Span): Promise<void> {
    if (this.forcedPort === 'random') {
      this.forcedPort = (await findPort()) + ''
      console.log('Forced random port:', this.forcedPort)
    }
  }

  public async start(options?: { skipBuild?: boolean }): Promise<void> {}

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
        treeKill(this.childProcess!.pid!, signal, (err) => {
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
            path.join(this.testDir, this.distDir, 'trace'),
            path.join(
              __dirname,
              '../../traces',
              `${path
                .relative(
                  path.join(__dirname, '../../'),
                  process.env.TEST_FILE_PATH!
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

  public async readFileBuffer(
    filename: string
  ): Promise<Buffer<ArrayBufferLike>> {
    return fs.readFile(path.join(this.testDir, filename))
  }

  public async writeFileBuffer(filename: string, data: Buffer): Promise<void> {
    return fs.writeFile(path.join(this.testDir, filename), data)
  }

  public async readFiles(
    dirname: string,
    predicate: (filename: string) => boolean
  ) {
    const absoluteDirname = path.join(this.testDir, dirname)
    const filenames = await fs.readdir(absoluteDirname, 'utf-8')

    return Promise.all(
      filenames
        .filter(predicate)
        .map((filename) =>
          fs.readFile(path.join(absoluteDirname, filename), 'utf8')
        )
    )
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
    content: string | ((content: string | undefined) => string),
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

  /**
   * Makes `linkFilename` point to `targetFilename`.
   *
   * Performs an atomic update to the symlink:
   * https://blog.moertel.com/posts/2005-08-22-how-to-change-symlinks-atomically.html
   */
  public async symlink(targetFilename: string, linkFilename: string) {
    const tmpLinkPath = path.join(this.testDir, linkFilename + '.tmp')
    try {
      await fs.symlink(path.join(this.testDir, targetFilename), tmpLinkPath)
      await fs.rename(tmpLinkPath, path.join(this.testDir, linkFilename))
    } catch (e) {
      await fs.unlink(tmpLinkPath)
      throw e
    }
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
   * Create a new browser window for the Next.js app.
   */
  public async browser(
    ...args: Parameters<OmitFirstArgument<typeof webdriver>>
  ): Promise<Playwright> {
    return webdriver(this.url, ...args)
  }

  /**
   * Create a new browser window for the Next.js app, and also return the page's
   * response.
   */
  public async browserWithResponse(
    ...args: Parameters<OmitFirstArgument<typeof webdriver>>
  ): Promise<{ browser: Playwright; response: Response }> {
    const [url, options = {}] = args

    let resolveResponse: (response: Response) => void

    const responsePromise = new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(`Timed out waiting for the response of ${url}`)
      }, 10_000)

      resolveResponse = (response: Response) => {
        clearTimeout(timer)
        resolve(response)
      }
    })

    const absoluteUrl = new URL(url, this.url).href

    const [browser, response] = await Promise.all([
      webdriver(this.url, url, {
        ...options,
        async beforePageLoad(page: Page) {
          await options.beforePageLoad?.(page)

          page.on('response', async (response) => {
            if (response.url() === absoluteUrl) {
              resolveResponse(response)
            }
          })
        },
      }),
      responsePromise,
    ])

    return { browser, response }
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
