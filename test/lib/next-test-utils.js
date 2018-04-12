import fetch from 'node-fetch'
import qs from 'querystring'
import http from 'http'
import express from 'express'
import path from 'path'
import getPort from 'get-port'
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import fkill from 'fkill'

import server from '../../dist/server/next'
import build from '../../dist/server/build'
import _export from '../../dist/server/export'
import _pkg from '../../package.json'

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

export function renderViaAPI (app, pathname, query) {
  const url = `${pathname}${query ? `?${qs.stringify(query)}` : ''}`
  return app.renderToHTML({ url }, {}, pathname, query)
}

export function renderViaHTTP (appPort, pathname, query) {
  return fetchViaHTTP(appPort, pathname, query).then((res) => res.text())
}

export function fetchViaHTTP (appPort, pathname, query) {
  const url = `http://localhost:${appPort}${pathname}${query ? `?${qs.stringify(query)}` : ''}`
  return fetch(url)
}

export function findPort () {
  return getPort()
}

// Launch the app in dev mode.
export function launchApp (dir, port) {
  const cwd = path.resolve(__dirname, '../../')
  return new Promise((resolve, reject) => {
    const instance = spawn('node', ['dist/bin/next', dir, '-p', port], { cwd })

    function handleStdout (data) {
      const message = data.toString()
      if (/> Ready on/.test(message)) {
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

// Kill a launched app
export async function killApp (instance) {
  await fkill(instance.pid)
}

export async function startApp (app) {
  await app.prepare()
  const handler = app.getRequestHandler()
  const server = http.createServer(handler)
  server.__app = app

  await promiseCall(server, 'listen')
  return server
}

export async function stopApp (app) {
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

export function waitFor (millis) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export async function startStaticServer (dir) {
  const app = express()
  const server = http.createServer(app)
  app.use(express.static(dir))

  await promiseCall(server, 'listen')
  return server
}

export async function check (contentFn, regex) {
  while (true) {
    try {
      const newContent = await contentFn()
      if (regex.test(newContent)) break
      await waitFor(1000)
    } catch (ex) {}
  }
}

export class File {
  constructor (path) {
    this.path = path
    this.originalContent = existsSync(this.path) ? readFileSync(this.path, 'utf8') : null
  }

  write (content) {
    if (!this.originalContent) {
      this.originalContent = content
    }
    writeFileSync(this.path, content, 'utf8')
  }

  replace (pattern, newValue) {
    const newContent = this.originalContent.replace(pattern, newValue)
    this.write(newContent)
  }

  delete () {
    unlinkSync(this.path)
  }

  restore () {
    this.write(this.originalContent)
  }
}
