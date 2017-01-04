import portFinder from 'portfinder'

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
