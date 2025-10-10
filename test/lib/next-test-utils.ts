import express from 'express'
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  createReadStream,
} from 'fs'
import { inspect, promisify } from 'util'
import http from 'http'
import path from 'path'

import type cheerio from 'cheerio'
import spawn from 'cross-spawn'
import { writeFile } from 'fs-extra'
import getPort from 'get-port'
import { getRandomPort } from 'get-port-please'
import fetch from 'node-fetch'
import qs from 'querystring'
import treeKill from 'tree-kill'
import { once } from 'events'

import server from 'next/dist/server/next'
import _pkg from 'next/package.json'

import type { SpawnOptions, ChildProcess } from 'child_process'
import type { RequestInit, Response } from 'node-fetch'
import type { NextServer } from 'next/dist/server/next'
import { Playwright } from 'next-webdriver'

import { shouldUseTurbopack } from './turbo'
import stripAnsi from 'strip-ansi'
import escapeRegex from 'escape-string-regexp'

// TODO: Create dedicated Jest environment that sets up these matchers
// Edge Runtime unit tests fail with "EvalError: Code generation from strings disallowed for this context" if these matchers are imported in those tests.
import './add-redbox-matchers'

export { shouldUseTurbopack }

export const nextServer = server
export const pkg = _pkg

// This goes straight to Node’s stdout, avoiding Jest's verbose output:
export const debugPrint = (...args: unknown[]) => {
  const prettyArgs = args
    .map((arg) =>
      typeof arg === 'string'
        ? arg
        : inspect(arg, { colors: process.stdout.isTTY })
    )
    .join(' ')

  const timestamp = new Date().toISOString().split('T')[1]

  return process.stdout.write(`[${timestamp}] ${prettyArgs}\n`)
}

export function initNextServerScript(
  scriptPath: string,
  successRegexp: RegExp,
  env: NodeJS.ProcessEnv,
  failRegexp?: RegExp,
  opts?: {
    cwd?: string
    nodeArgs?: string[]
    onStdout?: (data: any) => void
    onStderr?: (data: any) => void
    // If true, the promise will reject if the process exits with a non-zero code
    shouldRejectOnError?: boolean
  }
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const instance = spawn(
      'node',
      [...((opts && opts.nodeArgs) || []), '--no-deprecation', scriptPath],
      {
        env: { HOSTNAME: '::', ...env },
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

    if (opts?.shouldRejectOnError) {
      instance.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error('exited with code: ' + code))
        }
      })
    }

    instance.stdout!.on('data', handleStdout)
    instance.stderr!.on('data', handleStderr)

    instance.on('close', () => {
      instance.stdout!.removeListener('data', handleStdout)
      instance.stderr!.removeListener('data', handleStderr)
    })

    instance.on('error', (err) => {
      reject(err)
    })
  })
}

export function getFullUrl(
  appPortOrUrl: string | number,
  url?: string,
  hostname?: string
) {
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
 * @param pathname the pathname
 * @param query the query object to add to the pathname
 * @returns the pathname with the query
 */
export function withQuery(
  pathname: string,
  query: Record<string, any> | string
) {
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

export function getFetchUrl(
  appPort: string | number,
  pathname: string,
  query?: Record<string, any> | string | null | undefined
) {
  const url = query ? withQuery(pathname, query) : pathname
  return getFullUrl(appPort, url)
}

export function fetchViaHTTP(
  appPort: string | number,
  pathname: string,
  query?: Record<string, any> | string | null | undefined,
  opts?: RequestInit
): Promise<Response> {
  const url = query ? withQuery(pathname, query) : pathname
  return fetch(getFullUrl(appPort, url), opts)
}

export function renderViaHTTP(
  appPort: string | number,
  pathname: string,
  query?: Record<string, any> | string | undefined,
  opts?: RequestInit
) {
  return fetchViaHTTP(appPort, pathname, query, opts).then((res) => res.text())
}

export function findPort() {
  // [NOTE] What are we doing here?
  // There are some flaky tests failures caused by `No available ports found` from 'get-port'.
  // This may be related / fixed by upstream https://github.com/sindresorhus/get-port/pull/56,
  // however it happened after get-port switched to pure esm which is not easy to adapt by bump.
  // get-port-please seems to offer the feature parity so we'll try to use it, and leave get-port as fallback
  // for a while until we are certain to switch to get-port-please entirely.
  try {
    return getRandomPort()
  } catch (e) {
    require('console').warn('get-port-please failed, falling back to get-port')
    return getPort()
  }
}

export interface NextOptions {
  cwd?: string
  env?: NodeJS.Dict<string>
  nodeArgs?: string[]

  spawnOptions?: SpawnOptions
  instance?: (instance: ChildProcess) => void
  stderr?: true | 'log'
  stdout?: true | 'log'
  ignoreFail?: boolean

  onStdout?: (data: any) => void
  onStderr?: (data: any) => void
}

export function runNextCommand(
  argv: string[],
  options: NextOptions = {}
): Promise<{
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}> {
  const nextDir = path.dirname(require.resolve('next/package'))
  const nextBin = path.join(nextDir, 'dist/bin/next')
  const cwd = options.cwd || nextDir
  // Let Next.js decide the environment
  const env = {
    ...process.env,
    // @ts-ignore packages/next/types/global.d.ts should allow undefined NODE_ENV
    NODE_ENV: undefined as NodeJS.ProcessEnv['NODE_ENV'],
    __NEXT_TEST_MODE: 'true',
    ...options.env,
  }

  return new Promise((resolve, reject) => {
    debugPrint(`Running command "next ${argv.join(' ')}"`)
    const instance = spawn(
      'node',
      [...(options.nodeArgs || []), '--no-deprecation', nextBin, ...argv],
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
      instance.stderr!.on('data', function (chunk) {
        mergedStdio += chunk
        stderrOutput += chunk

        if (options.stderr === 'log') {
          debugPrint(chunk.toString())
        }
        if (typeof options.onStderr === 'function') {
          options.onStderr(chunk.toString())
        }
      })
    } else {
      instance.stderr!.on('data', function (chunk) {
        mergedStdio += chunk
      })
    }

    let stdoutOutput = ''
    if (options.stdout || options.onStdout) {
      instance.stdout!.on('data', function (chunk) {
        mergedStdio += chunk
        stdoutOutput += chunk

        if (options.stdout === 'log') {
          debugPrint(chunk.toString())
        }
        if (typeof options.onStdout === 'function') {
          options.onStdout(chunk.toString())
        }
      })
    } else {
      instance.stdout!.on('data', function (chunk) {
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
      err['stdout'] = stdoutOutput
      err['stderr'] = stderrOutput
      reject(err)
    })
  })
}

export interface NextDevOptions {
  cwd?: string
  env?: NodeJS.Dict<string>
  nodeArgs?: string[]
  nextBin?: string

  bootupMarker?: RegExp
  nextStart?: boolean
  turbo?: boolean

  stderr?: false
  stdout?: false

  onStdout?: (data: any) => void
  onStderr?: (data: any) => void
}

export function runNextCommandDev(
  argv: string[],
  stdOut?: boolean,
  opts: NextDevOptions = {}
): Promise<(typeof stdOut extends true ? string : ChildProcess) | undefined> {
  const nextDir = path.dirname(require.resolve('next/package'))
  const nextBin = opts.nextBin || path.join(nextDir, 'dist/bin/next')
  const cwd = opts.cwd || nextDir
  const env = {
    ...process.env,
    // @ts-ignore packages/next/types/global.d.ts should allow undefined NODE_ENV
    NODE_ENV: undefined as NodeJS.ProcessEnv['NODE_ENV'],
    __NEXT_TEST_MODE: 'true',
    ...opts.env,
  }

  const nodeArgs = opts.nodeArgs || []
  return new Promise((resolve, reject) => {
    const instance = spawn(
      'node',
      [...nodeArgs, '--no-deprecation', nextBin, ...argv],
      {
        cwd,
        env,
      }
    )
    let didResolve = false

    const bootType =
      opts.nextStart || stdOut ? 'start' : opts?.turbo ? 'turbo' : 'dev'

    function handleStdout(data) {
      const message = data.toString()
      const bootupMarkers = {
        dev: /✓ ready/i,
        turbo: /✓ ready/i,
        start: /✓ ready/i,
      }

      const strippedMessage = stripAnsi(message) as any

      if (
        (opts.bootupMarker && opts.bootupMarker.test(strippedMessage)) ||
        bootupMarkers[bootType].test(strippedMessage)
      ) {
        if (!didResolve) {
          didResolve = true
          // Pass down the original message
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

    instance.stderr!.on('data', handleStderr)
    instance.stdout!.on('data', handleStdout)

    instance.on('close', () => {
      instance.stderr!.removeListener('data', handleStderr)
      instance.stdout!.removeListener('data', handleStdout)
      if (!didResolve) {
        didResolve = true
        resolve(undefined)
      }
    })

    instance.on('error', (err) => {
      reject(err)
    })
  })
}

// Launch the app in development mode.
export function launchApp(
  dir: string,
  port: string | number,
  opts?: NextDevOptions
) {
  const options = opts ?? {}
  const useTurbo = shouldUseTurbopack()

  return runNextCommandDev(
    [
      useTurbo ? '--turbopack' : undefined,
      dir,
      '-p',
      port as string,
      '--hostname',
      '::',
    ].filter((flag: string | undefined): flag is string => Boolean(flag)),
    undefined,
    { ...options, turbo: useTurbo }
  )
}

export function nextBuild(
  dir: string,
  args: string[] = [],
  opts: NextOptions = {}
) {
  return runNextCommand(['build', dir, ...args], opts)
}

export function nextTest(
  dir: string,
  args: string[] = [],
  opts: NextOptions = {}
) {
  return runNextCommand(['experimental-test', dir, ...args], {
    ...opts,
    env: {
      JEST_WORKER_ID: undefined, // Playwright complains about being executed by Jest
      ...opts.env,
    },
  })
}

export function nextStart(
  dir: string,
  port: string | number,
  opts: NextDevOptions = {}
) {
  return runNextCommandDev(
    ['start', '-p', port as string, '--hostname', '::', dir],
    undefined,
    { ...opts, nextStart: true }
  )
}

export function buildTS(
  args: string[] = [],
  cwd?: string,
  env?: any
): Promise<void> {
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

    instance.stdout!.on('data', handleData)
    instance.stderr!.on('data', handleData)

    instance.on('exit', (code) => {
      if (code) {
        return reject(new Error('exited with code: ' + code + '\n' + output))
      }
      resolve()
    })
  })
}

export async function killProcess(
  pid: number,
  signal: NodeJS.Signals | number = 'SIGTERM'
): Promise<void> {
  return await new Promise((resolve, reject) => {
    treeKill(pid, signal, (err) => {
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
export async function killApp(
  instance?: ChildProcess,
  signal: NodeJS.Signals | number = 'SIGKILL'
) {
  if (!instance) {
    return
  }
  if (
    instance?.pid &&
    instance.exitCode === null &&
    instance.signalCode === null
  ) {
    const exitPromise = once(instance, 'exit')
    await killProcess(instance.pid, signal)
    await exitPromise
  }
}

async function startListen(server: http.Server, port?: number) {
  const listenerPromise = new Promise((resolve) => {
    server['__socketSet'] = new Set()
    const listener = server.listen(port, () => {
      resolve(null)
    })

    listener.on('connection', function (socket) {
      server['__socketSet'].add(socket)
      socket.on('close', () => {
        server['__socketSet'].delete(socket)
      })
    })
  })
  await listenerPromise
}

export async function startApp(app: NextServer) {
  // force require usage instead of dynamic import in jest
  // x-ref: https://github.com/nodejs/node/issues/35889
  process.env.__NEXT_TEST_MODE = 'jest'

  // TODO: tests that use this should be migrated to use
  // the nextStart test function instead as it tests outside
  // of jest's context
  await app.prepare()
  const handler = app.getRequestHandler()
  const server = http.createServer(handler)
  server['__app'] = app

  await startListen(server)

  return server
}

export async function stopApp(server: http.Server | undefined) {
  if (!server) {
    return
  }

  if (server['__app']) {
    await server['__app'].close()
  }

  // Node.js's http::close() prevents new connections from being accepted,
  // but doesn't close existing connections and if there are any leftover
  // whole process teardown will wait until it's being closed.
  // Instead, force close connections since this is teardown fn that we expect
  // any connections to be closed already.
  server['__socketSet']?.forEach(function (socket) {
    if (!socket.closed && !socket.destroyed) {
      socket.destroy()
    }
  })

  await promisify(server.close).apply(server)
}

export async function waitFor(
  millisOrCondition: number | (() => boolean)
): Promise<void> {
  if (typeof millisOrCondition === 'number') {
    return new Promise((resolve) => setTimeout(resolve, millisOrCondition))
  }

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (millisOrCondition()) {
        clearInterval(interval)
        resolve()
      }
    }, 100)
  })
}

export async function startStaticServer(
  dir: string,
  notFoundFile?: string,
  fixedPort?: number
) {
  const app = express()
  const server = http.createServer(app)
  app.use(express.static(dir))

  if (notFoundFile) {
    app.use((req, res) => {
      createReadStream(notFoundFile).pipe(res)
    })
  }

  await startListen(server, fixedPort)
  return server
}

export async function startCleanStaticServer(dir: string) {
  const app = express()
  const server = http.createServer(app)
  app.use(express.static(dir, { extensions: ['html'] }))

  await startListen(server)
  return server
}

/**
 * Check for content in 1 second intervals timing out after 30 seconds.
 * @deprecated use retry + expect instead
 * @param {() => Promise<unknown> | unknown} contentFn
 * @param {RegExp | string | number} regex
 * @param {boolean} hardError
 * @param {number} maxRetries
 * @returns {Promise<boolean>}
 */
export async function check(
  contentFn: () => any | Promise<any>,
  regex: any,
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
  path: string
  originalContent: string | null

  constructor(path: string) {
    this.path = path
    this.originalContent = existsSync(this.path)
      ? readFileSync(this.path, 'utf8')
      : null
  }

  write(content: string) {
    if (!this.originalContent) {
      this.originalContent = content
    }
    writeFileSync(this.path, content, 'utf8')
  }

  replace(pattern: RegExp | string, newValue: string) {
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

  prepend(str: string) {
    const content = readFileSync(this.path, 'utf8')
    this.write(str + content)
  }

  delete() {
    unlinkSync(this.path)
  }

  restore() {
    this.write(this.originalContent!)
  }
}

export async function retry<T>(
  fn: () => T | Promise<T>,
  duration: number = 3000,
  interval: number = 500,
  description?: string
): Promise<T> {
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
      debugPrint(
        `Retrying${description ? ` ${description}` : ''} in ${interval}ms`
      )
      await waitFor(interval)
    }
  }

  throw new Error('Duration cannot be less than 0.')
}

export async function assertHasRedbox(browser: Playwright) {
  const redbox = browser.locateRedbox()
  try {
    await redbox.waitFor({ timeout: 5000 })
  } catch (errorCause) {
    const error = new Error('Expected Redbox but found no visible one.')
    Error.captureStackTrace(error, assertHasRedbox)
    throw error
  }

  try {
    await redbox
      .locator('[data-nextjs-error-suspended]')
      .waitFor({ state: 'detached', timeout: 10000 })
  } catch (cause) {
    const error = new Error('Redbox still had suspended content after 10s', {
      cause,
    })
    Error.captureStackTrace(error, assertHasRedbox)
    throw error
  }
}

export async function assertNoRedbox(
  browser: Playwright,
  { waitInMs = 5000 }: { waitInMs?: number } = {}
) {
  await waitFor(waitInMs)
  const redbox = browser.locateRedbox()

  if (await redbox.isVisible()) {
    const [redboxHeader, redboxDescription, redboxSource] = await Promise.all([
      getRedboxHeader(browser).catch(() => '<missing>'),
      getRedboxDescription(browser).catch(() => '<missing>'),
      getRedboxSource(browser).catch(() => '<missing>'),
    ])

    const error = new Error(
      'Expected no visible Redbox but found one\n' +
        `header: ${redboxHeader}\n` +
        `description: ${redboxDescription}\n` +
        `source: ${redboxSource}`
    )
    Error.captureStackTrace(error, assertNoRedbox)
    throw error
  }
}

export async function assertNoErrorToast(browser: Playwright): Promise<void> {
  let didOpenRedbox = false

  try {
    await browser.waitForElementByCss('[data-issues]').click()
    didOpenRedbox = true
  } catch {
    // We expect this to fail.
  }

  if (didOpenRedbox) {
    // If a redbox was opened unexpectedly, we use the `assertNoRedbox` helper
    // to print a useful error message containing the redbox contents.
    await assertNoRedbox(browser, {
      // We already know the redbox is open, so we can skip waiting for it.
      waitInMs: 0,
    })
  }
}

export async function hasErrorToast(browser: Playwright): Promise<boolean> {
  return Boolean(
    await browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p) => p.shadowRoot.querySelector('[data-issues]'))

      const root = portal?.shadowRoot
      const node = root?.querySelector('[data-issues-count]')
      return !!node
    })
  )
}

export async function getToastErrorCount(browser: Playwright): Promise<number> {
  return parseInt(
    (await browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p) => p.shadowRoot.querySelector('[data-issues]'))

      const root = portal?.shadowRoot
      const node = root?.querySelector('[data-issues-count]')
      return node?.innerText || '0'
    })) ?? '0'
  )
}

/**
 * Has retried version of {@link hasErrorToast} built-in.
 * Success implies {@link assertHasRedbox}.
 */
export async function openRedbox(browser: Playwright): Promise<void> {
  const redbox = browser.locateRedbox()
  if (await redbox.isVisible()) {
    const error = new Error(
      'Redbox is already open. Use `assertHasRedbox` instead.'
    )
    Error.captureStackTrace(error, openRedbox)
    throw error
  }

  try {
    await browser.waitForElementByCss('[data-issues]').click()
  } catch (cause) {
    const error = new Error('Redbox did not open.')
    Error.captureStackTrace(error, openRedbox)
    throw error
  }
  await assertHasRedbox(browser)
}

export async function openDevToolsIndicatorPopover(
  browser: Playwright
): Promise<void> {
  const devToolsIndicator = await assertHasDevToolsIndicator(browser)

  try {
    await devToolsIndicator.click()
  } catch (cause) {
    const error = new Error('No DevTools Indicator to open.', { cause })
    Error.captureStackTrace(error, openDevToolsIndicatorPopover)
    throw error
  }
}

export async function getSegmentExplorerRoute(browser: Playwright) {
  return await browser
    .elementByCss('.segment-explorer-page-route-bar-path')
    .text()
    .catch(() => '<empty>')
}

export async function getSegmentExplorerContent(browser: Playwright) {
  // open the devtool button
  await openDevToolsIndicatorPopover(browser)

  // open the segment explorer
  await browser.elementByCss('[data-segment-explorer]').click()

  //  wait for the segment explorer to be visible
  await browser.waitForElementByCss('[data-nextjs-devtool-segment-explorer]')

  const rows = await browser.elementsByCss('.segment-explorer-item')
  let result: string[] = []
  for (const row of rows) {
    // query filename of row: segment-explorer-filename
    const segment = (
      (await (await row.$('.segment-explorer-filename--path'))?.innerText()) ||
      ''
    ).trim()
    const files = (
      (await (await row.$('.segment-explorer-files'))?.innerText()) || ''
    )
      .split(/\n+/)
      .map((file) => file.trim())

    // line format: segment [files]
    result.push(`${segment} [${files.join(', ')}]`)
  }
  return result.join('\n')
}

export async function hasDevToolsPanel(browser: Playwright) {
  const result = await browser.eval(() => {
    const portal = document.querySelector('nextjs-portal')
    return (
      portal?.shadowRoot?.querySelector('[data-nextjs-dialog-overlay]') != null
    )
  })
  return result
}

export async function assertHasDevToolsIndicator(browser: Playwright) {
  const devToolsIndicator = browser.locateDevToolsIndicator()
  try {
    await devToolsIndicator.waitFor({ timeout: 5000 })
  } catch (errorCause) {
    const error = new Error(
      'Expected DevTools Indicator but found no visible one.'
    )
    Error.captureStackTrace(error, assertHasDevToolsIndicator)
    throw error
  }

  return devToolsIndicator
}

export async function assertNoDevToolsIndicator(browser: Playwright) {
  const devToolsIndicator = browser.locateDevToolsIndicator()

  if (await devToolsIndicator.isVisible()) {
    const error = new Error(
      'Expected no visible DevTools Indicator but found one.'
    )
    Error.captureStackTrace(error, assertNoDevToolsIndicator)
    throw error
  }
}

export async function assertStaticIndicator(
  browser: Playwright,
  expectedRouteType: 'Static' | 'Dynamic' | undefined
): Promise<void> {
  await openDevToolsIndicatorPopover(browser)

  const routeType = await browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-toast]'))

    return (
      portal?.shadowRoot
        // 'Route\nStatic' || 'Route\nDynamic'
        ?.querySelector('[data-nextjs-route-type]')
        ?.innerText.split('\n')
        .pop()
    )
  })

  if (routeType !== expectedRouteType) {
    if (expectedRouteType) {
      throw new Error(
        `Expected static indicator with route type ${expectedRouteType}, found ${routeType} instead.`
      )
    } else {
      throw new Error(
        `Expected no static indicator, found ${routeType} instead.`
      )
    }
  }
}

export function getRedboxHeader(browser: Playwright): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header]'))
    const root = portal?.shadowRoot
    return root?.querySelector('[data-nextjs-dialog-header]')?.innerText ?? null
  })
}

export async function getRedboxTotalErrorCount(
  browser: Playwright
): Promise<number> {
  const text = await browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) =>
        p.shadowRoot.querySelector('[data-nextjs-dialog-header-total-count]')
      )

    const root = portal?.shadowRoot
    return root?.querySelector('[data-nextjs-dialog-header-total-count]')
      ?.innerText
  })
  return parseInt(text || '-1')
}

export function getRedboxSource(browser: Playwright): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) =>
        p.shadowRoot.querySelector(
          '#nextjs__container_errors_label, #nextjs__container_errors_label'
        )
      )
    const root = portal.shadowRoot
    return (
      root.querySelector('[data-nextjs-codeframe], [data-nextjs-terminal]')
        ?.innerText ?? null
    )
  })
}

export function getRedboxTitle(browser: Playwright): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header]'))
    const root = portal.shadowRoot
    return (
      root.querySelector(
        '[data-nextjs-dialog-header] .nextjs__container_errors__error_title'
      )?.innerText ?? null
    )
  })
}

export function getRedboxLabel(browser: Playwright): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header]'))
    const root = portal.shadowRoot
    return (
      root.querySelector('#nextjs__container_errors_label')?.innerText ?? null
    )
  })
}

export function getRedboxEnvironmentLabel(
  browser: Playwright
): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header]'))
    const root = portal.shadowRoot
    return (
      root.querySelector('[data-nextjs-environment-name-label]')?.innerText ??
      null
    )
  })
}

export function getRedboxDescription(
  browser: Playwright
): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header]'))
    const root = portal.shadowRoot
    return (
      root.querySelector('#nextjs__container_errors_desc')?.innerText ?? null
    )
  })
}

export function getRedboxDescriptionWarning(
  browser: Playwright
): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header]'))
    const root = portal.shadowRoot
    return (
      root.querySelector('#nextjs__container_errors__notes')?.innerText ?? null
    )
  })
}

export function getRedboxErrorLink(
  browser: Playwright
): Promise<string | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header]'))
    const root = portal.shadowRoot
    return (
      root.querySelector('#nextjs__container_errors__link')?.innerText ?? null
    )
  })
}

export function getBrowserBodyText(browser: Playwright) {
  return browser.eval<string>(
    'document.getElementsByTagName("body")[0].innerText'
  )
}

export function normalizeRegEx(src: string) {
  return new RegExp(src).source.replace(/\^\//g, '^\\/')
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function getBuildManifest(dir: string) {
  return readJson(path.join(dir, getDistDir(), 'build-manifest.json'))
}

export function getImagesManifest(dir: string) {
  return readJson(path.join(dir, getDistDir(), 'images-manifest.json'))
}

export function getPageFilesFromBuildManifest(dir: string, page: string) {
  const buildManifest = getBuildManifest(dir)
  const pageFiles = buildManifest.pages[page]
  if (!pageFiles) {
    throw new Error(`No files for page ${page}`)
  }

  return pageFiles
}

export function getContentOfPageFilesFromBuildManifest(
  dir: string,
  page: string
): string {
  const pageFiles = getPageFilesFromBuildManifest(dir, page)

  return pageFiles
    .map((file) => readFileSync(path.join(dir, getDistDir(), file), 'utf8'))
    .join('\n')
}

export function getPageFileFromBuildManifest(dir: string, page: string) {
  const pageFiles = getPageFilesFromBuildManifest(dir, page)

  const pageFile = pageFiles[pageFiles.length - 1]
  expect(pageFile).toEndWith('.js')
  if (!process.env.IS_TURBOPACK_TEST) {
    expect(pageFile).toInclude(`pages${page === '' ? '/index' : page}`)
  }
  if (!pageFile) {
    throw new Error(`No page file for page ${page}`)
  }

  return pageFile
}

export function readNextBuildClientPageFile(appDir: string, page: string) {
  const pageFile = getPageFileFromBuildManifest(appDir, page)
  return readFileSync(path.join(appDir, getDistDir(), pageFile), 'utf8')
}

export function getPagesManifest(dir: string) {
  const serverFile = path.join(dir, getDistDir(), 'server/pages-manifest.json')

  return readJson(serverFile)
}

export function updatePagesManifest(dir: string, content: any) {
  const serverFile = path.join(dir, getDistDir(), 'server/pages-manifest.json')

  return writeFile(serverFile, content)
}

export function getPageFileFromPagesManifest(dir: string, page: string) {
  const pagesManifest = getPagesManifest(dir)
  const pageFile = pagesManifest[page]
  if (!pageFile) {
    throw new Error(`No file for page ${page}`)
  }

  return pageFile
}

export function readNextBuildServerPageFile(appDir: string, page: string) {
  const pageFile = getPageFileFromPagesManifest(appDir, page)
  return readFileSync(
    path.join(appDir, getDistDir(), 'server', pageFile),
    'utf8'
  )
}

export function getClientBuildManifest(dir: string) {
  let buildId = readFileSync(path.join(dir, getDistDir(), 'BUILD_ID'), 'utf8')
  let code = readFileSync(
    path.join(dir, getDistDir(), 'static', buildId, '_buildManifest.js'),
    'utf8'
  )
  // eslint-disable-next-line no-eval
  let manifest = (0, eval)(`var self = global;${code};self.__BUILD_MANIFEST`)
  return manifest
}

export function getClientBuildManifestLoaderChunkUrlPath(
  dir: string,
  page: string
) {
  let manifest = getClientBuildManifest(dir)
  let chunk: string[] | undefined = manifest[page]
  if (chunk == null) {
    throw new Error(`Couldn't find page "${page}" in _buildManifest.js`)
  }
  if (chunk.length !== 1) {
    throw new Error(
      `Expected a single chunk, but found ${chunk.length} for "${page}" in _buildManifest.js`
    )
  }
  // Remove leading './' so that this can be used in a `url.contains(chunk)` check.
  return encodeURI(chunk[0].replace(/^\.\//, ''))
}

function runSuite(
  suiteName: string,
  context: { env: 'prod' | 'dev'; appDir: string } & Partial<{
    stderr: string
    stdout: string
    appPort: number
    code: number | null
    server: ChildProcess
  }>,
  options: {
    beforeAll?: Function
    afterAll?: Function
    runTests: Function
  } & NextDevOptions
) {
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

export function runDevSuite(
  suiteName: string,
  appDir: string,
  options: {
    beforeAll?: Function
    afterAll?: Function
    runTests: Function
    env?: NodeJS.ProcessEnv
  }
) {
  return runSuite(suiteName, { appDir, env: 'dev' }, options)
}

export function runProdSuite(
  suiteName: string,
  appDir: string,
  options: {
    beforeAll?: Function
    afterAll?: Function
    runTests: Function
    env?: NodeJS.ProcessEnv
  }
) {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      runSuite(suiteName, { appDir, env: 'prod' }, options)
    }
  )
}

/**
 * Parse the output and return all entries that match the provided `eventName`
 * @param {string} output output of the console
 * @param {string} eventName
 * @returns {Array<{}>}
 */
export function findAllTelemetryEvents(output: string, eventName: string) {
  const regex = /\[telemetry\] ({.+?^})/gms
  // Pop the last element of each entry to retrieve contents of the capturing group
  const events = [...output.matchAll(regex)].map((entry) =>
    JSON.parse(entry.pop()!)
  )
  return events.filter((e) => e.eventName === eventName).map((e) => e.payload)
}

type TestVariants = 'default' | 'turbo'

// WEB-168: There are some differences / incompletes in turbopack implementation enforces jest requires to update
// test snapshot when run against turbo. This fn returns describe, or describe.skip dependes on the running context
// to avoid force-snapshot update per each runs until turbopack update includes all the changes.
export function getSnapshotTestDescribe(variant: TestVariants) {
  const runningEnv = variant ?? 'default'
  if (runningEnv !== 'default' && runningEnv !== 'turbo') {
    throw new Error(
      `An invalid test env was passed: ${variant} (only "default" and "turbo" are valid options)`
    )
  }

  const shouldRunTurboDev = shouldUseTurbopack()
  const shouldSkip =
    (runningEnv === 'turbo' && !shouldRunTurboDev) ||
    (runningEnv === 'default' && shouldRunTurboDev)

  return shouldSkip ? describe.skip : describe
}

/**
 * @returns `null` if there are no frames
 */
export async function getRedboxComponentStack(
  browser: Playwright
): Promise<string | null> {
  const componentStackFrameElements = await browser.elementsByCss(
    '[data-nextjs-container-errors-pseudo-html] code'
  )
  if (componentStackFrameElements.length === 0) {
    return null
  }

  const componentStackFrameTexts = await Promise.all(
    componentStackFrameElements.map((f) => f.innerText())
  )

  return componentStackFrameTexts.join('\n').trim()
}

export async function hasRedboxCallStack(browser: Playwright) {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-body]'))
    const root = portal?.shadowRoot

    return root?.querySelectorAll('[data-nextjs-call-stack-frame]').length > 0
  })
}

export async function getRedboxCallStack(
  browser: Playwright
): Promise<string[] | null> {
  return browser.eval(() => {
    const portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-call-stack-frame]'))
    const root = portal?.shadowRoot
    const frameElements = root?.querySelectorAll(
      '[data-nextjs-call-stack-frame]'
    )

    const stack: string[] = []
    if (frameElements !== undefined) {
      let foundInternalFrame = false
      for (const frameElement of frameElements) {
        // `innerText` will be "${methodName}\n${location}".
        // Ideally `innerText` would be "${methodName} ${location}"
        // so that c&p automatically does the right thing.
        const frame = frameElement.innerText.replace(/\n+/g, ' ')

        // TODO: Special marker if source-mapping fails.

        // Feel free to adjust this heuristic if it accidentally hides too much.
        const isInternalFrame =
          // likely https://linear.app/vercel/issue/NDX-464
          // location starts with `./dist` e.g. "NotFoundBoundary ./dist/esm/[...]"
          / .\/dist\//.test(frame)

        if (isInternalFrame) {
          // We only add one of these frames.
          // If we'd add all of them, the stack would change during refactorings which is annoying.
          if (!foundInternalFrame) {
            stack.push('<FIXME-internal-frame>')
          }
          foundInternalFrame = true
        } else if (frame.includes('file://')) {
          stack.push('<FIXME-file-protocol>')
        } else if (frame.includes('.next/')) {
          stack.push('<FIXME-next-dist-dir>')
        } else {
          stack.push(frame)
        }
      }
    }

    return stack
  })
}

export async function getRedboxCallStackCollapsed(
  browser: Playwright
): Promise<string> {
  const callStackFrameElements = await browser.elementsByCss(
    '.nextjs-container-errors-body > [data-nextjs-codeframe] > :first-child, ' +
      '.nextjs-container-errors-body > [data-nextjs-call-stack-frame], ' +
      '.nextjs-container-errors-body > [data-nextjs-collapsed-call-stack-details] > summary'
  )
  const callStackFrameTexts = await Promise.all(
    callStackFrameElements.map((f) => f.innerText())
  )

  return callStackFrameTexts.join('\n---\n').trim()
}

export async function getVersionCheckerText(
  browser: Playwright
): Promise<string> {
  await browser.waitForElementByCss('[data-nextjs-version-checker]', 30000)
  const versionCheckerElement = await browser.elementByCss(
    '[data-nextjs-version-checker]'
  )
  const versionCheckerText = await versionCheckerElement.innerText()
  return versionCheckerText.trim()
}

export function colorToRgb(color) {
  switch (color) {
    case 'blue':
      return 'rgb(0, 0, 255)'
    case 'red':
      return 'rgb(255, 0, 0)'
    case 'green':
      return 'rgb(0, 128, 0)'
    case 'yellow':
      return 'rgb(255, 255, 0)'
    case 'purple':
      return 'rgb(128, 0, 128)'
    case 'black':
      return 'rgb(0, 0, 0)'
    default:
      throw new Error('Unknown color')
  }
}

export function getUrlFromBackgroundImage(backgroundImage: string) {
  const matches = backgroundImage.match(/url\("[^)]+"\)/g)!.map((match) => {
    // Extract the URL part from each match. The match includes 'url("' and '"")', so we remove those.
    return match.slice(5, -2)
  })

  return matches
}

export const getTitle = (browser: Playwright) =>
  browser.elementByCss('title', { state: 'attached' }).text()

async function checkMeta(
  browser: Playwright,
  queryValue: string,
  expected: RegExp | string | string[] | undefined | null,
  queryKey: string = 'property',
  tag: string = 'meta',
  domAttributeField: string = 'content'
) {
  const values = await browser.eval<(string | null)[]>(
    `[...document.querySelectorAll('${tag}[${queryKey}="${queryValue}"]')].map((el) => el.getAttribute("${domAttributeField}"))`
  )
  if (expected instanceof RegExp) {
    expect(values[0]).toMatch(expected)
  } else {
    if (Array.isArray(expected)) {
      expect(values).toEqual(expected)
    } else {
      // If expected is undefined, then it should not exist.
      // Otherwise, it should exist in the matched values.
      if (expected === undefined) {
        expect(values).not.toContain(undefined)
      } else {
        expect(values).toContain(expected)
      }
    }
  }
}

export function createDomMatcher(browser: Playwright) {
  /**
   * @param tag - tag name, e.g. 'meta'
   * @param query - query string, e.g. 'name="description"'
   * @param expectedObject - expected object, e.g. { content: 'my description' }
   * @returns {Promise<void>} - promise that resolves when the check is done
   *
   * @example
   * const matchDom = createDomMatcher(browser)
   * await matchDom('meta', 'name="description"', { content: 'description' })
   */
  return async (
    tag: string,
    query: string,
    expectedObject: Record<string, string | null | undefined>
  ) => {
    const props = await browser.eval(`
      const el = document.querySelector('${tag}[${query}]');
      const res = {}
      const keys = ${JSON.stringify(Object.keys(expectedObject))}
      for (const k of keys) {
        res[k] = el?.getAttribute(k)
      }
      res
    `)
    expect(props).toEqual(expectedObject)
  }
}

export function createMultiHtmlMatcher($: ReturnType<typeof cheerio.load>) {
  /**
   * @param tag - tag name, e.g. 'meta'
   * @param queryKey - query key, e.g. 'property'
   * @param domAttributeField - dom attribute field, e.g. 'content'
   * @param expected - expected object, e.g. { description: 'my description' }
   * @returns {void} - void when the check is done
   *
   * @example
   *
   * const $ = await next.render$('html')
   * const matchHtml = createMultiHtmlMatcher($)
   * matchHtml('meta', 'name', 'property', {
   *   description: 'description',
   *   og: 'og:description'
   * })
   *
   */
  return (
    tag: string,
    queryKey: string,
    domAttributeField: string,
    expected: Record<string, string | string[] | undefined>
  ) => {
    const res = {}
    for (const key of Object.keys(expected)) {
      const el = $(`${tag}[${queryKey}="${key}"]`)
      if (el.length > 1) {
        res[key] = el.toArray().map((el) => el.attribs[domAttributeField])
      } else {
        res[key] = el.attr(domAttributeField)
      }
    }
    expect(res).toEqual(expected)
  }
}

export function createMultiDomMatcher(browser: Playwright) {
  /**
   * @param tag - tag name, e.g. 'meta'
   * @param queryKey - query key, e.g. 'property'
   * @param domAttributeField - dom attribute field, e.g. 'content'
   * @param expected - expected object, e.g. { description: 'my description' }
   * @returns {Promise<void>} - promise that resolves when the check is done
   *
   * @example
   * const matchMultiDom = createMultiDomMatcher(browser)
   * await matchMultiDom('meta', 'property', 'content', {
   *   description: 'description',
   *   'og:title': 'title',
   *   'twitter:title': 'title'
   * })
   *
   */
  return async (
    tag: string,
    queryKey: string,
    domAttributeField: string,
    expected: Record<string, string | string[] | undefined | null>
  ) => {
    await Promise.all(
      Object.keys(expected).map(async (key) => {
        return checkMeta(
          browser,
          key,
          expected[key],
          queryKey,
          tag,
          domAttributeField
        )
      })
    )
  }
}

export const checkMetaNameContentPair = (
  browser: Playwright,
  name: string,
  content: string | string[]
) => checkMeta(browser, name, content, 'name')

export const checkLink = (
  browser: Playwright,
  rel: string,
  content: string | string[]
) => checkMeta(browser, rel, content, 'rel', 'link', 'href')

export async function getStackFramesContent(browser) {
  const stackFrameElements = await browser.elementsByCss(
    '[data-nextjs-call-stack-frame]'
  )
  const stackFramesContent = (
    await Promise.all(
      stackFrameElements.map(async (frame) => {
        const functionNameEl = await frame.$('.call-stack-frame-method-name')
        const sourceEl = await frame.$('[data-has-source="true"]')
        const functionName = functionNameEl
          ? await functionNameEl.innerText()
          : ''
        const source = sourceEl ? await sourceEl.innerText() : ''

        if (!functionName) {
          return ''
        }
        return `at ${functionName} (${source})`
      })
    )
  )
    .filter(Boolean)
    .join('\n')

  return stackFramesContent
}

export async function toggleCollapseCallStackFrames(browser: Playwright) {
  const button = await browser.elementByCss(
    '[data-nextjs-call-stack-ignored-list-toggle-button]'
  )
  const lastExpanded = await button.getAttribute(
    'data-nextjs-call-stack-ignored-list-toggle-button'
  )
  await button.click()

  await retry(async () => {
    const currExpanded = await button.getAttribute(
      'data-nextjs-call-stack-ignored-list-toggle-button'
    )
    expect(currExpanded).not.toBe(lastExpanded)
  })
}

/**
 * Encodes the params into a URLSearchParams object using the format that the
 * now builder uses for route matches (adding the `nxtP` prefix to the keys).
 *
 * @param params - The params to encode.
 * @param extraQueryParams - The extra query params to encode (without the `nxtP` prefix).
 * @returns The encoded URLSearchParams object.
 */
export function createNowRouteMatches(
  params: Record<string, string>,
  extraQueryParams: Record<string, string> = {}
): URLSearchParams {
  const urlSearchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    urlSearchParams.append(`nxtP${key}`, value)
  }
  for (const [key, value] of Object.entries(extraQueryParams)) {
    urlSearchParams.append(key, value)
  }

  return urlSearchParams
}

export async function assertNoConsoleErrors(browser: Playwright) {
  const logs = await browser.log()
  const warningsAndErrors = logs.filter((log) => {
    return (
      log.source === 'warning' ||
      (log.source === 'error' &&
        // These are expected when we visit 404 pages.
        !log.message.startsWith(
          'Failed to load resource: the server responded with a status of 404'
        ))
    )
  })

  expect(warningsAndErrors).toEqual([])
}

export async function getHighlightedDiffLines(
  browser: Playwright
): Promise<[string, string][]> {
  const lines = await browser.elementsByCss(
    '[data-nextjs-container-errors-pseudo-html--diff]'
  )
  return Promise.all(
    lines.map(async (line) => [
      (await line.getAttribute(
        'data-nextjs-container-errors-pseudo-html--diff'
      ))!,
      (await line.innerText())[0],
    ])
  )
}

export function trimEndMultiline(str: string) {
  return str
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
}

/**
 * Normalizes the manifest by applying the replacements to the manifest. This
 * is useful for testing the manifest in a snapshot test.
 *
 * @param manifest - The manifest to normalize.
 * @param replacements - The replacements to perform on the manifest.
 * @returns The normalized manifest.
 */
export function normalizeManifest<T>(
  manifest: unknown,
  replacements: [search: string, replace: string][]
): T {
  return JSON.parse(
    replacements.reduce(
      (acc, [search, replace]) =>
        acc.replace(
          new RegExp(
            // We want to match the literal string, so we need to escape it
            // again
            escapeRegex(
              JSON.stringify(
                // The output has already been escaped, so we need to escape our
                // search string.
                escapeRegex(search)
              )
                // Remove the quotes added by the JSON.stringify call.
                .replace(/^"(.*)"/, '$1')
            ),
            'g'
          ),
          replace
        ),
      // We'll perform the replacements on the JSON stringified manifest.
      JSON.stringify(manifest)
    )
  )
}

export function getDistDir(): '.next' | '.next/dev' {
  // global.isNextDev is set in e2e/development/production tests.
  // NEXT_TEST_MODE is set in CI or local test-* commands.
  return (global as any).isNextDev || process.env.NEXT_TEST_MODE === 'dev'
    ? '.next/dev'
    : '.next'
}
