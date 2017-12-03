import { join, sep, parse } from 'path'
import fs from 'mz/fs'
import glob from 'glob-promise'

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
  if (i.slice(-4) === '.jsx') return [i]
  if (i.slice(-5) === '.json') return [i]

  if (i[i.length - 1] === sep) {
    return [
      i + 'index.js',
      i + 'index.jsx',
      i + 'index.json'
    ]
  }

  return [
    i + '.js',
    join(i, 'index.js'),
    i + '.jsx',
    join(i, 'index.jsx'),
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

  // We need the path to be case sensitive
  const realpath = await getTrueFilePath(p)
  if (p !== realpath) return false

  return stat.isFile() || stat.isFIFO()
}

// This is based on the stackoverflow answer: http://stackoverflow.com/a/33139702/457224
// We assume we'll get properly normalized path names as p
async function getTrueFilePath (p) {
  let fsPathNormalized = p
  // OSX: HFS+ stores filenames in NFD (decomposed normal form) Unicode format,
  // so we must ensure that the input path is in that format first.
  if (process.platform === 'darwin') fsPathNormalized = fsPathNormalized.normalize('NFD')

  // !! Windows: Curiously, the drive component mustn't be part of a glob,
  // !! otherwise glob.sync() will invariably match nothing.
  // !! Thus, we remove the drive component and instead pass it in as the 'cwd'
  // !! (working dir.) property below.
  var pathRoot = parse(fsPathNormalized).root
  var noDrivePath = fsPathNormalized.slice(Math.max(pathRoot.length - 1, 0))

  // Perform case-insensitive globbing (on Windows, relative to the drive /
  // network share) and return the 1st match, if any.
  // Fortunately, glob() with nocase case-corrects the input even if it is
  // a *literal* path.
  const result = await glob(noDrivePath, { nocase: true, cwd: pathRoot })
  return result[0]
}
