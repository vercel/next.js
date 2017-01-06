import portFinder from 'portfinder'
import fetch from 'node-fetch'
import qs from 'querystring'

import server from '../../dist/server/next'
import build from '../../dist/server/build'
import _pkg from '../../package.json'

export const nextServer = server
export const nextBuild = build
export const pkg = _pkg

export function findPort () {
  return new Promise((resolve, reject) => {
    portFinder.getPort((err, port) => {
      if (err) return reject(err)
      return resolve(port)
    })
  })
}

export function renderViaAPI (app, pathname, query = {}) {
  return app.renderToHTML({}, {}, pathname, query)
}

export function renderViaHTTP (appPort, pathname, query = {}) {
  const url = `http://localhost:${appPort}${pathname}?${qs.stringify(query)}`
  return fetch(url).then((res) => res.text())
}
