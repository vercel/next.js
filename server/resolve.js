import { join, sep } from 'path'
import { getParamRoutes, isFile, toParts, compareRoute } from './helpers'

export default async function resolve (id, base) {
  const paths = getPaths(id)
  const segments = id.replace(base, '').replace(/^\//, '').split('/')
  const matched = await getMatchedRoute(segments, base)

  if (matched) {
    const file = join(base, matched.path)
    if (await isFile(file)) {
      return { file, params: matched.params }
    }
  }

  for (const file of paths) {
    if (await isFile(file)) {
      return { file, params: {} }
    }
  }

  const err = new Error(`Cannot find module ${id}`)
  err.code = 'ENOENT'
  throw err
}

export function resolveFromList (id, files) {
  const paths = getPaths(id)
  const set = new Set(files)
  for (const p of paths) {
    if (set.has(p)) return p
  }
}

async function getMatchedRoute (segments, base) {
  const files = await getParamRoutes(base)
  const routes = files.filter(route => compareRoute(toParts(route), segments))

  if (routes.length < 1) {
    return null
  }

  const path = routes[0]
  const params = toParts(path).reduce((_params, part, i) => {
    return !part.startsWith('{') ? _params : {
      ..._params,
      [part.slice(1, -1)]: segments[i]
    }
  }, {})

  return { path, params }
}

function getPaths (id) {
  const i = sep === '/' ? id : id.replace(/\//g, sep)

  if (i.slice(-3) === '.js') return [i]
  if (i[i.length - 1] === sep) return [i + 'index.js']

  return [
    i + '.js',
    join(i, 'index.js')
  ]
}
