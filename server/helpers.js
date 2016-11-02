import { join } from 'path'
import fs from 'mz/fs'
import glob from 'glob-promise'

export async function getParamRoutes (base) {
  let files = await glob(join(base, '**'))

  const result = await Promise.all(files.map(f => isFile(f)))
  files = result.reduce((_files, isFile, i) => {
    return isFile ? [..._files, files[i]] : _files
  })

  files = files.filter(f => f.indexOf('}') > 0)
  files = files.map(f => f.replace(base, ''))
  return files
}

export async function isFile (p) {
  let stat
  try {
    stat = await fs.stat(p)
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
  return stat.isFile() || stat.isFIFO()
}

export function toParts (route) {
  return route.replace(/^\/|\.js$/g, '').split('/')
}

export function compareRoute (parts, segments) {
  // parts:    ['user', '{id}', 'action']
  // segments: ['user', '1234', 'action']
  if (parts.length === segments.length) {
    return parts.map((p, i) => p.startsWith('{') || segments[i] === parts[i]).every(ok => ok)
  }
  return false
}
