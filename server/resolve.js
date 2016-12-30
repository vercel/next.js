import { join, sep } from 'path'
import fs from 'mz/fs'

export default async function resolve (id) {
  const paths = getPaths(id)
  for (const p of paths) {
    if (await isFile(p)) {
      return p
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

function getPaths (id) {
  const i = sep === '/' ? id : id.replace(/\//g, sep)

  if (i.slice(-3) === '.js') return [i]
  if (i.slice(-5) === '.json') return [i]

  if (i[i.length - 1] === sep) {
    return [
      i + 'index.json',
      i + 'index.js'
    ]
  }

  return [
    i + '.js',
    join(i, 'index.js'),
    i + '.json',
    join(i, 'index.json')
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
