const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const log = process.env.NEXT_TEST_CACHE_AUDIT
const cache = process.env.NEXT_TEST_CACHE_PATH
const append = fs.appendFileSync
append(log, '')
for (const target of new Set([fs, fs.promises, fsp]))
  for (const name of [
    'readFile',
    'readFileSync',
    'stat',
    'statSync',
    'lstat',
    'lstatSync',
    'writeFile',
    'writeFileSync',
    'mkdir',
    'mkdirSync',
    'rename',
    'renameSync',
    'rm',
    'rmSync',
  ]) {
    const original = target[name]
    if (typeof original !== 'function') continue
    target[name] = function (...args) {
      if (
        args.some(
          (value) =>
            typeof value === 'string' && path.resolve(value).startsWith(cache)
        )
      )
        append(
          log,
          JSON.stringify({
            pid: process.pid,
            name,
            paths: args.filter((value) => typeof value === 'string'),
          }) + '\n'
        )
      return Reflect.apply(original, this, args)
    }
  }
require('node:module').syncBuiltinESMExports()
