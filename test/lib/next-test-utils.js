import spawn from 'cross-spawn'
import express from 'express'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { writeFile } from 'fs-extra'
import getPort from 'get-port'
import http from 'http'
// `next` here is the symlink in `test/node_modules/next` which points to the root directory.
// This is done so that requiring from `next` works.
// The reason we don't import the relative path `../../dist/<etc>` is that it would lead to inconsistent module singletons
import server from 'next/dist/server/next'
import _pkg from 'next/package.json'
import fetch from 'node-fetch'
import path from 'path'
import qs from 'querystring'
import treeKill from 'tree-kill'

export const nextServer = server
export const pkg = _pkg

// polyfill Object.fromEntries for the test/integration/relay-analytics tests
// on node 10, this can be removed after we no longer support node 10
if (!Object.fromEntries) {
  Object.fromEntries = require('core-js/features/object/from-entries')
}

export function initNextServerScript(
  scriptPath,
  successRegexp,
  env,
  failRegexp,
  opts
) {
  return new Promise((resolve, reject) => {
    const instance = spawn('node', ['--no-deprecation', scriptPath], { env })

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

export function renderViaAPI(app, pathname, query) {
  const url = `${pathname}${query ? `?${qs.stringify(query)}` : ''}`
  return app.renderToHTML({ url }, {}, pathname, query)
}

export function renderViaHTTP(appPort, pathname, query, opts) {
  return fetchViaHTTP(appPort, pathname, query, opts).then((res) => res.text())
}

export function fetchViaHTTP(appPort, pathname, query, opts) {
  const url = `http://localhost:${appPort}${pathname}${
    query ? `?${qs.stringify(query)}` : ''
  }`
  return fetch(url, opts)
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
    ...options.env,
    NODE_ENV: '',
    __NEXT_TEST_MODE: 'true',
  }

  return new Promise((resolve, reject) => {
    console.log(`Running command "next ${argv.join(' ')}"`)
    const instance = spawn('node', ['--no-deprecation', nextBin, ...argv], {
      ...options.spawnOptions,
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    if (typeof options.instance === 'function') {
      options.instance(instance)
    }

    let stderrOutput = ''
    if (options.stderr) {
      instance.stderr.on('data', function (chunk) {
        stderrOutput += chunk

        if (options.stderr === 'log') {
          console.log(chunk.toString())
        }
      })
    }

    let stdoutOutput = ''
    if (options.stdout) {
      instance.stdout.on('data', function (chunk) {
        stdoutOutput += chunk

        if (options.stdout === 'log') {
          console.log(chunk.toString())
        }
      })
    }

    instance.on('close', (code, signal) => {
      if (
        !options.stderr &&
        !options.stdout &&
        !options.ignoreFail &&
        code !== 0
      ) {
        return reject(new Error(`command failed with code ${code}`))
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
  const nextBin = path.join(nextDir, 'dist/bin/next')
  const cwd = opts.cwd || nextDir
  const env = {
    ...process.env,
    NODE_ENV: undefined,
    __NEXT_TEST_MODE: 'true',
    ...opts.env,
  }

  return new Promise((resolve, reject) => {
    const instance = spawn('node', ['--no-deprecation', nextBin, ...argv], {
      cwd,
      env,
    })
    let didResolve = false

    function handleStdout(data) {
      const message = data.toString()
      const bootupMarkers = {
        dev: /compiled successfully/i,
        start: /started server/i,
      }
      if (
        (opts.bootupMarker && opts.bootupMarker.test(message)) ||
        bootupMarkers[opts.nextStart || stdOut ? 'start' : 'dev'].test(message)
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
  return runNextCommandDev([dir, '-p', port], undefined, opts)
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

// Kill a launched app
export async function killApp(instance) {
  await new Promise((resolve, reject) => {
    treeKill(instance.pid, (err) => {
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

export async function startApp(app) {
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

export async function startStaticServer(dir) {
  const app = express()
  const server = http.createServer(app)
  app.use(express.static(dir))

  await promiseCall(server, 'listen')
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
export async function check(contentFn, regex, hardError = true) {
  let content
  let lastErr

  for (let tries = 0; tries < 30; tries++) {
    try {
      content = await contentFn()
      if (typeof regex === 'string') {
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
    throw new Error('TIMED OUT: ' + regex + '\n\n' + content)
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
    const result = await browser.executeScript(input)
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
  let attempts = 30
  do {
    const has = await evaluate(browser, () => {
      return Boolean(
        [].slice
          .call(document.querySelectorAll('nextjs-portal'))
          .find((p) =>
            p.shadowRoot.querySelector(
              '#nextjs__container_errors_label, #nextjs__container_build_error_label'
            )
          )
      )
    })
    if (has) {
      return true
    }
    if (--attempts < 0) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  } while (expected)
  return false
}

export async function getRedboxHeader(browser) {
  return retry(
    () =>
      evaluate(browser, () => {
        const portal = [].slice
          .call(document.querySelectorAll('nextjs-portal'))
          .find((p) => p.shadowRoot.querySelector('[data-nextjs-dialog-header'))
        const root = portal.shadowRoot
        return root
          .querySelector('[data-nextjs-dialog-header]')
          .innerText.replace(/__WEBPACK_DEFAULT_EXPORT__/, 'Unknown')
      }),
    3000,
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
              '#nextjs__container_errors_label, #nextjs__container_build_error_label'
            )
          )
        const root = portal.shadowRoot
        return root
          .querySelector('[data-nextjs-codeframe], [data-nextjs-terminal]')
          .innerText.replace(/__WEBPACK_DEFAULT_EXPORT__/, 'Unknown')
      }),
    3000,
    500,
    'getRedboxSource'
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

  if (existsSync(serverFile)) {
    return readJson(serverFile)
  }
  return readJson(path.join(dir, '.next/serverless/pages-manifest.json'))
}

export function updatePagesManifest(dir, content) {
  const serverFile = path.join(dir, '.next/server/pages-manifest.json')

  if (existsSync(serverFile)) {
    return writeFile(serverFile, content)
  }
  return writeFile(
    path.join(dir, '.next/serverless/pages-manifest.json'),
    content
  )
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
