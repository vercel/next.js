import { join, sep } from 'path'
import fs from 'mz/fs'
import glob from 'glob-promise'

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
  let files, routes

  files = await glob(join(base, '**'))
  files = files.filter(f => f.indexOf('@') > 0)

  routes = files.map(f => f.replace(base, ''))
  routes = routes.filter(route => {
    let r = toSegments(route)
    return r.length === segments.length && segments[0] === r[0]
  })

  if (routes.length < 1) {
    return null
  }

  const path = routes[0]
  const params = toSegments(path).reduce((_params, part, i) => {
    return !part.startsWith('@') ? _params : {
      ..._params,
      [part.slice(1)]: segments[i]
    }
  }, {})

  return { path, params }
}

function toSegments (route) {
  return route.replace(/^\/|\.js$/g, '').replace(/@/g, '@@').split(/_@|\/@?/)
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

async function isFile (p) {
  let stat
  try {
    stat = await fs.stat(p)
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
  return stat.isFile() || stat.isFIFO()
}
