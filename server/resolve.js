import { join, sep, parse } from 'path'
import fs from 'mz/fs'
import glob from 'glob-promise'
import getConfig from './config'

const dir = process.cwd()
const config = getConfig(dir)

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

  for (const ext of config.pagesExtensions.map(ext => `.${ext}`)) {
    if (i.slice(-ext.length) === ext) return [i]
  }

  if (i[i.length - 1] === sep) {
    return [
      ...config.pagesExtensions.map(ext => i + `index.${ext}`)
    ]
  }

  function * getPagesPaths (extensions) {
    for (const ext of config.pagesExtensions) {
      yield i + `.${ext}`
      yield join(i, `index.${ext}`)
    }
  }

  return [
    ...getPagesPaths(config.pagesExtensions)
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
