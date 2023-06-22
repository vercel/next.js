import spawn from 'cross-spawn'
import express from 'express'
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  createReadStream,
} from 'fs'
import { writeFile } from 'fs-extra'
import getPort from 'get-port'
import http from 'http'
import https from 'https'
import server from 'next/dist/server/next'
import _pkg from 'next/package.json'
import fetch from 'node-fetch'
import path from 'path'
import qs from 'querystring'
import treeKill from 'tree-kill'

export const nextServer = server
export const pkg = _pkg

export function initNextServerScript(
  scriptPath,
  successRegexp,
  env,
  failRegexp,
  opts
) {
  return new Promise((resolve, reject) => {
    const instance = spawn(
      'node',
      [
        ...((opts && opts.nodeArgs) || []),
        '-r',
        require.resolve('./mocks-require-hook'),
        '--no-deprecation',
        scriptPath,
      ],
      {
        env,
        cwd: opts && opts.cwd,
      }
    )

    function handleStdout(data) {
      const message = data.toString()
      if (successRegexp.test(message)) {
        resolve(instance)
      }
      process.stdout.write(message)

      if (opts && opts.onStdout) {
        opts.onStdout(message.toString())
      }
    }

    function handleStderr(data) {
      const message = data.toString()
      if (failRegexp && failRegexp.test(message)) {
        instance.kill()
        return reject(new Error('received failRegexp'))
      }
      process.stderr.write(message)

      if (opts && opts.onStderr) {
        opts.onStderr(message.toString())
      }
    }

    instance.stdout.on('data', handleStdout)
    instance.stderr.on('data', handleStderr)

    instance.on('close', () => {
      instance.stdout.removeListener('data', handleStdout)
      instance.stderr.removeListener('data', handleStderr)
    })

    instance.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * @param {string | number} appPortOrUrl
 * @param {string} [url]
 * @param {string} [hostname]
 * @returns
 */
export function getFullUrl(appPortOrUrl, url, hostname) {
  let fullUrl =
    typeof appPortOrUrl === 'string' && appPortOrUrl.startsWith('http')
      ? appPortOrUrl
      : `http://${hostname ? hostname : 'localhost'}:${appPortOrUrl}${url}`

  if (typeof appPortOrUrl === 'string' && url) {
    const parsedUrl = new URL(fullUrl)
    const parsedPathQuery = new URL(url, fullUrl)

    parsedUrl.hash = parsedPathQuery.hash
    parsedUrl.search = parsedPathQuery.search
    parsedUrl.pathname = parsedPathQuery.pathname

    if (hostname && parsedUrl.hostname === 'localhost') {
      parsedUrl.hostname = hostname
    }
    fullUrl = parsedUrl.toString()
  }
  return fullUrl
}

/**
 * Appends the querystring to the url
 *
 * @param {string} pathname the pathname
 * @param {Record<string,any> | string} query the query object to add to the pathname
 * @returns the pathname with the query
 */
export function withQuery(pathname, query) {
  const querystring = typeof query === 'string' ? query : qs.stringify(query)
  if (querystring.length === 0) {
    return pathname
  }

  // If there's a `?` between the pathname and the querystring already, then
  // don't add another one.
  if (querystring.startsWith('?') || pathname.endsWith('?')) {
    return `${pathname}${querystring}`
  }

  return `${pathname}?${querystring}`
}

export function renderViaAPI(app, pathname, query) {
  const url = query ? withQuery(pathname, query) : pathname
  return app.renderToHTML({ url }, {}, pathname, query)
}

/**
 * @param {string | number} appPort
 * @param {string} pathname
 * @param {Record<string, any> | string | undefined} [query]
 * @param {import('node-fetch').RequestInit} [opts]
 * @returns {Promise<string>}
 */
export function renderViaHTTP(appPort, pathname, query, opts) {
  return fetchViaHTTP(appPort, pathname, query, opts).then((res) => res.text())
}

/**
 * @param {string | number} appPort
 * @param {string} pathname
 * @param {Record<string, any> | string | null | undefined} [query]
 * @param {import('node-fetch').RequestInit} [opts]
 * @returns {Promise<Response & {buffer: any} & {headers: Headers}>}
 */
export function fetchViaHTTP(appPort, pathname, query, opts) {
  const url = query ? withQuery(pathname, query) : pathname
  return fetch(getFullUrl(appPort, url), {
    // in node.js v17 fetch favors IPv6 but Next.js is
    // listening on IPv4 by default so force IPv4 DNS resolving
    agent: (parsedUrl) => {
      if (parsedUrl.protocol === 'https:') {
        return new https.Agent({ family: 4 })
      }
      if (parsedUrl.protocol === 'http:') {
        return new http.Agent({ family: 4 })
      }
    },
    ...opts,
  })
}

export function findPort() {
  return getPort()
}

export function runNextCommand(argv, options = {}) {
  const nextDir = path.dirname(require.resolve('next/package'))
  const nextBin = path.join(nextDir, 'dist/bin/next')
  const cwd = options.cwd || nextDir
  // Let Next.js decide the environment
  const env = {
    ...process.env,
    NODE_ENV: '',
    __NEXT_TEST_MODE: 'true',
    ...options.env,
  }

  return new Promise((resolve, reject) => {
    console.log(`Running command "next ${argv.join(' ')}"`)
    const instance = spawn(
      'node',
      [
        ...(options.nodeArgs || []),
        '-r',
        require.resolve('./mocks-require-hook'),
        '--no-deprecation',
        nextBin,
        ...argv,
      ],
      {
        ...options.spawnOptions,
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )

    if (typeof options.instance === 'function') {
      options.instance(instance)
    }

    let mergedStdio = ''

    let stderrOutput = ''
    if (options.stderr || options.onStderr) {
      instance.stderr.on('data', function (chunk) {
        mergedStdio += chunk
        stderrOutput += chunk

        if (options.stderr === 'log') {
          console.log(chunk.toString())
        }
        if (typeof options.onStderr === 'function') {
          options.onStderr(chunk.toString())
        }
      })
    } else {
      instance.stderr.on('data', function (chunk) {
        mergedStdio += chunk
      })
    }

    let stdoutOutput = ''
    if (options.stdout || options.onStdout) {
      instance.stdout.on('data', function (chunk) {
        mergedStdio += chunk
        stdoutOutput += chunk

        if (options.stdout === 'log') {
          console.log(chunk.toString())
        }
        if (typeof options.onStdout === 'function') {
          options.onStdout(chunk.toString())
        }
      })
    } else {
      instance.stdout.on('data', function (chunk) {
        mergedStdio += chunk
      })
    }

    instance.on('close', (code, signal) => {
      if (
        !options.stderr &&
        !options.stdout &&
        !options.ignoreFail &&
        (code !== 0 || signal)
      ) {
        return reject(
          new Error(
            `command failed with code ${code} signal ${signal}\n${mergedStdio}`
          )
        )
      }

      if (code || signal) {
        console.error(`process exited with code ${code} and signal ${signal}`)
      }
      resolve({
        code,
        signal,
        stdout: stdoutOutput,
        stderr: stderrOutput,
      })
    })

    instance.on('error', (err) => {
      err.stdout = stdoutOutput
      err.stderr = stderrOutput
      reject(err)
    })
  })
}

export function runNextCommandDev(argv, stdOut, opts = {}) {
  const nextDir = path.dirname(require.resolve('next/package'))
  const nextBin = opts.nextBin || path.join(nextDir, 'dist/bin/next')
  const cwd = opts.cwd || nextDir
  const env = {
    ...process.env,
    NODE_ENV: undefined,
    __NEXT_TEST_MODE: 'true',
    ...opts.env,
  }

  const nodeArgs = opts.nodeArgs || []
  return new Promise((resolve, reject) => {
    const instance = spawn(
      'node',
      [
        ...nodeArgs,
        '-r',
        require.resolve('./mocks-require-hook'),
        '--no-deprecation',
        nextBin,
        ...argv,
      ],
      {
        cwd,
        env,
      }
    )
    let didResolve = false

    function handleStdout(data) {
      const message = data.toString()
      const bootupMarkers = {
        dev: /compiled .*successfully/i,
        turbo: /started server/i,
        start: /started server/i,
      }
      if (
        (opts.bootupMarker && opts.bootupMarker.test(message)) ||
        bootupMarkers[
          opts.nextStart || stdOut ? 'start' : opts?.turbo ? 'turbo' : 'dev'
        ].test(message)
      ) {
        if (!didResolve) {
          didResolve = true
          resolve(stdOut ? message : instance)
        }
      }

      if (typeof opts.onStdout === 'function') {
        opts.onStdout(message)
      }

      if (opts.stdout !== false) {
        process.stdout.write(message)
      }
    }

    function handleStderr(data) {
      const message = data.toString()
      if (typeof opts.onStderr === 'function') {
        opts.onStderr(message)
      }

      if (opts.stderr !== false) {
        process.stderr.write(message)
      }
    }

    instance.stdout.on('data', handleStdout)
    instance.stderr.on('data', handleStderr)

    instance.on('close', () => {
      instance.stdout.removeListener('data', handleStdout)
      instance.stderr.removeListener('data', handleStderr)
      if (!didResolve) {
        didResolve = true
        resolve()
      }
    })

    instance.on('error', (err) => {
      reject(err)
    })
  })
}

// Launch the app in dev mode.
export function launchApp(dir, port, opts) {
  const options = opts ?? {}
  const useTurbo = shouldRunTurboDevTest()

  return runNextCommandDev(
    [useTurbo ? '--turbo' : undefined, dir, '-p', port].filter(Boolean),
    undefined,
    {
      ...options,
      turbo: useTurbo,
    }
  )
}

export function nextBuild(dir, args = [], opts = {}) {
  return runNextCommand(['build', dir, ...args], opts)
}

export function nextExport(dir, { outdir }, opts = {}) {
  return runNextCommand(['export', dir, '--outdir', outdir], opts)
}

export function nextExportDefault(dir, opts = {}) {
  return runNextCommand(['export', dir], opts)
}

export function nextLint(dir, args = [], opts = {}) {
  return runNextCommand(['lint', dir, ...args], opts)
}

export function nextStart(dir, port, opts = {}) {
  return runNextCommandDev(['start', '-p', port, dir], undefined, {
    ...opts,
    nextStart: true,
  })
}

export function buildTS(args = [], cwd, env = {}) {
  cwd = cwd || path.dirname(require.resolve('next/package'))
  env = { ...process.env, NODE_ENV: undefined, ...env }

  return new Promise((resolve, reject) => {
    const instance = spawn(
      'node',
      ['--no-deprecation', require.resolve('typescript/lib/tsc'), ...args],
      { cwd, env }
    )
    let output = ''

    const handleData = (chunk) => {
      output += chunk.toString()
    }

    instance.stdout.on('data', handleData)
    instance.stderr.on('data', handleData)

    instance.on('exit', (code) => {
      if (code) {
        return reject(new Error('exited with code: ' + code + '\n' + output))
      }
      resolve()
    })
  })
}

export async function killProcess(pid) {
  await new Promise((resolve, reject) => {
    treeKill(pid, (err) => {
      if (err) {
        if (
          process.platform === 'win32' &&
          typeof err.message === 'string' &&
          (err.message.includes(`no running instance of the task`) ||
            err.message.includes(`not found`))
        ) {
          // Windows throws an error if the process is already dead
          //
          // Command failed: taskkill /pid 6924 /T /F
          // ERROR: The process with PID 6924 (child process of PID 6736) could not be terminated.
          // Reason: There is no running instance of the task.
          return resolve()
        }
        return reject(err)
      }

      resolve()
    })
  })
}

// Kill a launched app
export async function killApp(instance) {
  await killProcess(instance.pid)
}

export async function startApp(app) {
  // force require usage instead of dynamic import in jest
  // x-ref: https://github.com/nodejs/node/issues/35889
  process.env.__NEXT_TEST_MODE = 'jest'

  // TODO: tests that use this should be migrated to use
  // the nextStart test function instead as it tests outside
  // of jest's context
  await app.prepare()
  const handler = app.getRequestHandler()
  const server = http.createServer(handler)
  server.__app = app

  await promiseCall(server, 'listen')
  return server
}

export async function stopApp(server) {
  if (server.__app) {
    await server.__app.close()
  }
  await promiseCall(server, 'close')
}

export function promiseCall(obj, method, ...args) {
  return new Promise((resolve, reject) => {
    const newArgs = [
      ...args,
      function (err, res) {
        if (err) return reject(err)
        resolve(res)
      },
    ]

    obj[method](...newArgs)
  })
}

export function waitFor(millis) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export async function startStaticServer(dir, notFoundFile, fixedPort) {
  const app = express()
  const server = http.createServer(app)
  app.use(express.static(dir))

  if (notFoundFile) {
    app.use((req, res) => {
      createReadStream(notFoundFile).pipe(res)
    })
  }

  await promiseCall(server, 'listen', fixedPort)
  return server
}

export async function startCleanStaticServer(dir) {
  const app = express()
  const server = http.createServer(app)
  app.use(express.static(dir, { extensions: ['html'] }))

  await promiseCall(server, 'listen')
  return server
}

// check for content in 1 second intervals timing out after
// 30 seconds
export async function check(
  contentFn,
  regex,
  hardError = true,
  maxRetries = 30
) {
  let content
  let lastErr

  for (let tries = 0; tries < maxRetries; tries++) {
    try {
      content = await contentFn()
      if (typeof regex !== typeof /regex/) {
        if (regex === content) {
          return true
        }
      } else if (regex.test(content)) {
        // found the content
        return true
      }
      await waitFor(1000)
    } catch (err) {
      await waitFor(1000)
      lastErr = err
    }
  }
  console.error('TIMED OUT CHECK: ', { regex, content, lastErr })

  if (hardError) {
    throw new Error('TIMED OUT: ' + regex + '\n\n' + content + '\n\n' + lastErr)
  }
  return false
}

export class File {
  constructor(path) {
    this.path = path
    this.originalContent = existsSync(this.path)
      ? readFileSync(this.path, 'utf8')
      : null
  }

  write(content) {
    if (!this.originalContent) {
      this.originalContent = content
    }
    writeFileSync(this.path, content, 'utf8')
  }

  replace(pattern, newValue) {
    const currentContent = readFileSync(this.path, 'utf8')
    if (pattern instanceof RegExp) {
      if (!pattern.test(currentContent)) {
        throw new Error(
          `Failed to replace content.\n\nPattern: ${pattern.toString()}\n\nContent: ${currentContent}`
        )
      }
    } else if (typeof pattern === 'string') {
      if (!currentContent.includes(pattern)) {
        throw new Error(
          `Failed to replace content.\n\nPattern: ${pattern}\n\nContent: ${currentContent}`
        )
      }
    } else {
      throw new Error(`Unknown replacement attempt type: ${pattern}`)
    }

    const newContent = currentContent.replace(pattern, newValue)
    this.write(newContent)
  }

  delete() {
    unlinkSync(this.path)
  }

  restore() {
    this.write(this.originalContent)
  }
}

export async function evaluate(browser, input) {
  if (typeof input === 'function') {
    const result = await browser.eval(input)
    await new Promise((resolve) => setTimeout(resolve, 30))
    return result
  } else {
    throw new Error(`You must pass a function to be evaluated in the browser.`)
  }
}

export async function retry(fn, duration = 3000, interval = 500, description) {
  if (duration % interval !== 0) {
    throw new Error(
      `invalid duration ${duration} and interval ${interval} mix, duration must be evenly divisible by interval`
    )
  }

  for (let i = duration; i >= 0; i -= interval) {
    try {
      return await fn()
    } catch (err) {
      if (i === 0) {
        console.error(
          `Failed to retry${
            description ? ` ${description}` : ''
          } within ${duration}ms`
        )
        throw err
      }
      console.warn(
        `Retrying${description ? ` ${description}` : ''} in ${interval}ms`
      )
      await waitFor(interval)
    }
  }
}

export async function hasRedbox(browser, expected = true) {
  for (let i = 0; i < 30; i++) {
    const result = await evaluate(browser, () => {
      return Boolean(
        [].slice
          .call(document.querySelectorAll('nextjs-portal'))
          .find((p) =>
            p.shadowRoot.querySelector(
              '#nextjs__container_errors_label, #nextjs__container_build_error_label, #nextjs__container_root_layout_error_label'
            )
          )
      )
    })

    if (result === expected) {
      return result
    }
    await waitFor(1000)
  }
  return false
}

export async function getRedboxHeader(browser) {
  return retry(
    () => {
      if (shouldRunTurboDevTest()) {
        return evaluate(browser, () => {
          const portal = [].slice
            .call(document.querySelectorAll('nextjs-portal'))
            .find((p) =>
              p.shadowRoot.querySelector('[data-nextjs-turbo-dialog-body]')
            )
          const root = portal.shadowRoot
          return root.querySelector('[data-nextjs-turbo-dialog-body]').innerText
        })
      } else {
        return evaluate(browser, () => {
          const portal = [].slice
            .call(document.querySelectorAll('nextjs-portal'))
            .find((p) =>
              p.shadowRoot.querySelector('[data-nextjs-dialog-header]')
            )
          const root = portal.shadowRoot
          return root.querySelector('[data-nextjs-dialog-header]').innerText
        })
      }
    },
    10000,
    500,
    'getRedboxHeader'
  )
}

export async function getRedboxSource(browser) {
  return retry(
    () =>
      evaluate(browser, () => {
        const portal = [].slice
          .call(document.querySelectorAll('nextjs-portal'))
          .find((p) =>
            p.shadowRoot.querySelector(
              '#nextjs__container_errors_label, #nextjs__container_build_error_label, #nextjs__container_root_layout_error_label'
            )
          )
        const root = portal.shadowRoot
        return root.querySelector(
          '[data-nextjs-codeframe], [data-nextjs-terminal]'
        ).innerText
      }),
    10000,
    500,
    'getRedboxSource'
  )
}

export async function getRedboxDescription(browser) {
  return retry(
    () =>
      evaluate(browser, () => {
        const portal = [].slice
          .call(document.querySelectorAll('nextjs-portal'))
          .find((p) =>
            p.shadowRoot.querySelector('[data-nextjs-dialog-header]')
          )
        const root = portal.shadowRoot
        return root.querySelector('#nextjs__container_errors_desc').innerText
      }),
    3000,
    500,
    'getRedboxDescription'
  )
}

export function getBrowserBodyText(browser) {
  return browser.eval('document.getElementsByTagName("body")[0].innerText')
}

export function normalizeRegEx(src) {
  return new RegExp(src).source.replace(/\^\//g, '^\\/')
}

function readJson(path) {
  return JSON.parse(readFileSync(path))
}

export function getBuildManifest(dir) {
  return readJson(path.join(dir, '.next/build-manifest.json'))
}

export function getPageFileFromBuildManifest(dir, page) {
  const buildManifest = getBuildManifest(dir)
  const pageFiles = buildManifest.pages[page]
  if (!pageFiles) {
    throw new Error(`No files for page ${page}`)
  }

  const pageFile = pageFiles.find(
    (file) =>
      file.endsWith('.js') &&
      file.includes(`pages${page === '' ? '/index' : page}`)
  )
  if (!pageFile) {
    throw new Error(`No page file for page ${page}`)
  }

  return pageFile
}

export function readNextBuildClientPageFile(appDir, page) {
  const pageFile = getPageFileFromBuildManifest(appDir, page)
  return readFileSync(path.join(appDir, '.next', pageFile), 'utf8')
}

export function getPagesManifest(dir) {
  const serverFile = path.join(dir, '.next/server/pages-manifest.json')

  return readJson(serverFile)
}

export function updatePagesManifest(dir, content) {
  const serverFile = path.join(dir, '.next/server/pages-manifest.json')

  return writeFile(serverFile, content)
}

export function getPageFileFromPagesManifest(dir, page) {
  const pagesManifest = getPagesManifest(dir)
  const pageFile = pagesManifest[page]
  if (!pageFile) {
    throw new Error(`No file for page ${page}`)
  }

  return pageFile
}

export function readNextBuildServerPageFile(appDir, page) {
  const pageFile = getPageFileFromPagesManifest(appDir, page)
  return readFileSync(path.join(appDir, '.next', 'server', pageFile), 'utf8')
}

/**
 *
 * @param {string} suiteName
 * @param {{env: 'prod' | 'dev', appDir: string}} context
 * @param {{beforeAll?: Function; afterAll?: Function; runTests: Function}} options
 */
function runSuite(suiteName, context, options) {
  const { appDir, env } = context
  describe(`${suiteName} ${env}`, () => {
    beforeAll(async () => {
      options.beforeAll?.(env)
      context.stderr = ''
      const onStderr = (msg) => {
        context.stderr += msg
      }
      context.stdout = ''
      const onStdout = (msg) => {
        context.stdout += msg
      }
      if (env === 'prod') {
        context.appPort = await findPort()
        const { stdout, stderr, code } = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
          env: options.env || {},
          nodeArgs: options.nodeArgs,
        })
        context.stdout = stdout
        context.stderr = stderr
        context.code = code
        context.server = await nextStart(context.appDir, context.appPort, {
          onStderr,
          onStdout,
          env: options.env || {},
          nodeArgs: options.nodeArgs,
        })
      } else if (env === 'dev') {
        context.appPort = await findPort()
        context.server = await launchApp(context.appDir, context.appPort, {
          onStderr,
          onStdout,
          env: options.env || {},
          nodeArgs: options.nodeArgs,
        })
      }
    })
    afterAll(async () => {
      options.afterAll?.(env)
      if (context.server) {
        await killApp(context.server)
      }
    })
    options.runTests(context, env)
  })
}

/**
 *
 * @param {string} suiteName
 * @param {string} appDir
 * @param {{beforeAll?: Function; afterAll?: Function; runTests: Function; env?: Record<string, string>}} options
 */
export function runDevSuite(suiteName, appDir, options) {
  return runSuite(suiteName, { appDir, env: 'dev' }, options)
}

/**
 *
 * @param {string} suiteName
 * @param {string} appDir
 * @param {{beforeAll?: Function; afterAll?: Function; runTests: Function; env?: Record<string, string>}} options
 */
export function runProdSuite(suiteName, appDir, options) {
  return runSuite(suiteName, { appDir, env: 'prod' }, options)
}

/**
 * Parse the output and return all entries that match the provided `eventName`
 * @param {string} output output of the console
 * @param {string} eventName
 * @returns {Array<{}>}
 */
export function findAllTelemetryEvents(output, eventName) {
  const regex = /\[telemetry\] ({.+?^})/gms
  // Pop the last element of each entry to retrieve contents of the capturing group
  const events = [...output.matchAll(regex)].map((entry) =>
    JSON.parse(entry.pop())
  )
  return events.filter((e) => e.eventName === eventName).map((e) => e.payload)
}

/**
 * Utility function to determine if a given test case needs to run with --turbo.
 *
 * This is primarily for the gradual test enablement with latest turbopack upstream changes.
 *
 * Note: it could be possible to dynamically create test cases itself (createDevTest(): it.each([...])), but
 * it makes hard to conform with existing lint rules. Instead, starting off from manual fixture setup and
 * update test cases accordingly as turbopack changes enable more test cases.
 */
export function shouldRunTurboDevTest() {
  if (!!process.env.TEST_WASM) {
    return false
  }

  const shouldRunTurboDev = !!process.env.TURBOPACK
  // short-circuit to run all the test with --turbo enabled skips glob matching costs
  if (shouldRunTurboDev) {
    console.log(
      `Running tests with turbopack via custom environment variable TURBOPACK`
    )
    return true
  }

  return false
}

// WEB-168: There are some differences / incompletes in turbopack implementation enforces jest requires to update
// test snapshot when run against turbo. This fn returns describe, or describe.skip dependes on the running context
// to avoid force-snapshot update per each runs until turbopack update includes all the changes.
export function getSnapshotTestDescribe(variant) {
  const runningEnv = variant ?? 'default'
  if (runningEnv !== 'default' && runningEnv !== 'turbo') {
    throw new Error(
      `An invalid test env was passed: ${variant} (only "default" and "turbo" are valid options)`
    )
  }

  const shouldRunTurboDev = shouldRunTurboDevTest()
  const shouldSkip =
    (runningEnv === 'turbo' && !shouldRunTurboDev) ||
    (runningEnv === 'default' && shouldRunTurboDev)

  return shouldSkip ? describe.skip : describe
}

/**
 * For better editor support, pass in the variants this should run on (`default` and/or `turbo`) as cases.
 *
 * This is necessary if separate snapshots are needed for next.js with webpack vs turbopack.
 *
 * @type {Pick<import("jest").Describe, "each">}
 */
export const describeVariants = {
  each: (variants) => (name, fn) => {
    if (
      !Array.isArray(variants) ||
      !variants.every((val) => typeof val === 'string')
    ) {
      throw new Error('variants need to be an array of strings')
    }

    for (const variant of variants) {
      getSnapshotTestDescribe(variant).each([variant])(name, fn)
    }
  },
}
