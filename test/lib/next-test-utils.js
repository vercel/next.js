import fetch from 'node-fetch'
import http from 'http'
import qs from 'querystring'
import express from 'express'
import path from 'path'
import getPort from 'get-port'
import { spawn } from 'child_process'
import fkill from 'fkill'
import cheerio from 'cheerio'

// `next` here is the symlink in `test/node_modules/next` which points to the root directory.
// This is done so that requiring from `next` works.
// The reason we don't import the relative path `../../dist/<etc>` is that it would lead to inconsistent module singletons
import server from 'next/dist/server/next'
import build from 'next/dist/build'
import _export from 'next/dist/export'
import _pkg from 'next/package.json'

export const nextServer = server
export const nextBuild = build
export const nextExport = _export
export const pkg = _pkg

export function initNextServerScript (scriptPath, successRegexp, env) {
  return new Promise((resolve, reject) => {
    const instance = spawn('node', [scriptPath], { env })

    function handleStdout (data) {
      const message = data.toString()
      if (successRegexp.test(message)) {
        resolve(instance)
      }
      process.stdout.write(message)
    }

    function handleStderr (data) {
      process.stderr.write(data.toString())
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

export function runNextCommand (argv, options = {}) {
  const cwd = path.dirname(require.resolve('next/package'))
  return new Promise((resolve, reject) => {
    console.log(`Running command "next ${argv.join(' ')}"`)
    const instance = spawn('node', ['dist/bin/next', ...argv], { ...options.spawnOptions, cwd, stdio: ['ignore', 'pipe', 'pipe'] })

    let stderrOutput = ''
    if (options.stderr) {
      instance.stderr.on('data', function (chunk) {
        stderrOutput += chunk
      })
    }

    let stdoutOutput = ''
    if (options.stdout) {
      instance.stdout.on('data', function (chunk) {
        stdoutOutput += chunk
      })
    }

    instance.on('close', () => {
      resolve({
        stdout: stdoutOutput,
        stderr: stderrOutput
      })
    })

    instance.on('error', (err) => {
      err.stdout = stdoutOutput
      err.stderr = stderrOutput
      reject(err)
    })
  })
}

export function runNextCommandDev (argv, stdOut) {
  const cwd = path.dirname(require.resolve('next/package'))
  return new Promise((resolve, reject) => {
    const instance = spawn('node', ['dist/bin/next', ...argv], { cwd })

    function handleStdout (data) {
      const message = data.toString()
      if (/> Ready on/.test(message)) {
        resolve(stdOut ? message : instance)
      }
      process.stdout.write(message)
    }

    function handleStderr (data) {
      process.stderr.write(data.toString())
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

// Launch the app in dev mode.
export function launchApp (dir, port) {
  return runNextCommandDev([dir, '-p', port])
}

// Kill a launched app
export async function killApp (instance) {
  await fkill(instance.pid)
}

// Launch the app in dev mode.
export async function runNextDev (dir) {
  const port = await getPort()
  const cwd = path.dirname(require.resolve('next/package'))
  return new Promise((resolve, reject) => {
    const instance = spawn('node', ['dist/bin/next', dir, '-p', port], { cwd })

    function handleStdout (data) {
      const message = data.toString()
      if (/> Ready on/.test(message)) {
        resolve(createTestServerInstance(instance, port))
      }
      process.stdout.write(message)
    }

    function handleStderr (data) {
      process.stderr.write(data.toString())
    }

    instance.stdout.on('data', handleStdout)
    instance.stderr.on('data', handleStderr)

    instance.on('close', () => {
      instance.stdout.removeListener('data', handleStdout)
      instance.stderr.removeListener('data', handleStderr)
    })

    instance.on('error', reject)
  })
}

function createTestServerInstance (instance, port) {
  return {
    port,
    instance,
    getURL (path = '/') {
      return `http://localhost:${port}${path}`
    },
    close () {
      return fkill(instance.pid)
    },
    fetch (path) {
      const url = this.getURL(path)
      return fetch(url)
    },
    fetchHTML (path) {
      return this
        .fetch(path)
        .then(res => res.text())
    },
    fetch$ (path) {
      return this
        .fetchHTML(path)
        .then(cheerio.load)
    }
  }
}

export async function startApp (app) {
  await app.prepare()
  const handler = app.getRequestHandler()
  const server = http.createServer(handler)
  server.__app = app

  await promiseCall(server, 'listen')

  server.port = server.address().port
  server.getURL = (path) => `http://localhost:${server.port}${path}`
  return server
}

export async function stopApp (server) {
  if (server.__app) {
    await server.__app.close()
  }
  await promiseCall(server, 'close')
}

function promiseCall (obj, method, ...args) {
  return new Promise((resolve, reject) => {
    const newArgs = [
      ...args,
      function (err, res) {
        if (err) return reject(err)
        resolve(res)
      }
    ]

    obj[method](...newArgs)
  })
}

export async function startStaticServer (dir) {
  const app = express()
  const server = http.createServer(app)
  app.use(express.static(dir))

  await promiseCall(server, 'listen')

  server.port = server.address().port
  server.getURL = (path) => `http://localhost:${server.port}${path}`
  return server
}

export function waitFor (millis) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export function findPort () {
  return getPort()
}

export function fetchViaHTTP (appPort, pathname, query, opts) {
  const url = `http://localhost:${appPort}${pathname}${query ? `?${qs.stringify(query)}` : ''}`
  return fetch(url, opts)
}

export function renderViaHTTP (appPort, pathname, query) {
  return fetchViaHTTP(appPort, pathname, query).then((res) => res.text())
}

export function renderViaAPI (app, pathname, query) {
  const url = `${pathname}${query ? `?${qs.stringify(query)}` : ''}`
  return app.renderToHTML({ url }, {}, pathname, query)
}

export async function check (contentFn, regex) {
  let found = false
  const timeout = setTimeout(async () => {
    if (found) {
      return
    }
    let content
    try {
      content = await contentFn()
    } catch (err) {
      console.error('Error while getting content', { regex })
    }
    console.error('TIMED OUT CHECK: ', { regex, content })
    throw new Error('TIMED OUT: ' + regex + '\n\n' + content)
  }, 1000 * 30)
  while (!found) {
    try {
      const newContent = await contentFn()
      if (regex.test(newContent)) {
        found = true
        clearTimeout(timeout)
        break
      }
      await waitFor(1000)
    } catch (ex) {}
  }
}
