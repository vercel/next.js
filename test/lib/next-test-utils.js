import portFinder from 'portfinder'

import _next from '../../dist/server/next'
import _pkg from '../../package.json'

export const next = _next
export const pkg = _pkg

export function findPort () {
  return new Promise((resolve, reject) => {
    portFinder.getPort((err, port) => {
      if (err) return reject(err)
      return resolve(port)
    })
  })
}
