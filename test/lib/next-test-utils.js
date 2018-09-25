import fetch from 'node-fetch'
import qs from 'querystring'
import http from 'http'
import express from 'express'
import path from 'path'
import getPort from 'get-port'
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import fkill from 'fkill'

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
  let found = false
  setTimeout(async () => {
    if (found) {
      return
    }
    let content
    try {
      content = await contentFn()
    } catch (err) {
      console.error('Error while getting content', {regex})
    }
    console.error('TIMED OUT CHECK: ', {regex, content})
    throw new Error('TIMED OUT: ' + regex + '\n\n' + content)
  }, 1000 * 30)
  while (!found) {
    try {
      const newContent = await contentFn()
      if (regex.test(newContent)) {
        found = true
        break
      }
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

// react-error-overlay uses an iframe so we have to read the contents from the frame
export async function getReactErrorOverlayContent (browser) {
  let found = false
  setTimeout(() => {
    if (found) {
      return
    }
    console.error('TIMED OUT CHECK FOR IFRAME')
    throw new Error('TIMED OUT CHECK FOR IFRAME')
  }, 1000 * 30)
  while (!found) {
    try {
      await browser.waitForElementByCss('iframe', 10000)

      const hasIframe = await browser.hasElementByCssSelector('iframe')
      if (!hasIframe) {
        throw new Error('Waiting for iframe')
      }

      found = true
      return browser.eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
    } catch (ex) {
      await waitFor(1000)
    }
  }
  return browser.eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
}
