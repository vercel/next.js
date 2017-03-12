import fetch from 'node-fetch'
import qs from 'querystring'
import http from 'http'

import server from '../../dist/server/next'
import build from '../../dist/server/build'
import _pkg from '../../package.json'

export const nextServer = server
export const nextBuild = build
export const pkg = _pkg

export function renderViaAPI (app, pathname, query = {}) {
  return app.renderToHTML({}, {}, pathname, query)
}

export function renderViaHTTP (appPort, pathname, query = {}) {
  const url = `http://localhost:${appPort}${pathname}?${qs.stringify(query)}`
  return fetch(url).then((res) => res.text())
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
  await server.__app.close()
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
