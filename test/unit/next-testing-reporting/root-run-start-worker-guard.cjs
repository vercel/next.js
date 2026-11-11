'use strict'
const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')
const original = Module._load
const compilerAttempts = []
let nativeAttempts = 0
Module._load = function (request, parent, isMain) {
  const file = Module._resolveFilename(request, parent, isMain)
  if (
    typeof file === 'string' &&
    /(?:\.node$|[\\/]next-swc[\\/]|[\\/]build[\\/]swc(?:[\\/]|\.js$)|[\\/]experimental[\\/]testing[\\/](?:compiler(?:[\\/]index)?|execution[\\/]execute|watch-worker)\.js$)/.test(
      file
    )
  ) {
    compilerAttempts.push(file)
    throw new Error(
      'RunStart worker verification cannot evaluate a compiler, executor or addon'
    )
  }
  return Reflect.apply(original, this, [request, parent, isMain])
}
process.dlopen = () => {
  nativeAttempts++
  throw new Error('RunStart worker verification cannot load Native')
}
module.exports = {
  compilerAttempts,
  get nativeAttempts() {
    return nativeAttempts
  },
}
process.on('exit', () => {
  if (!process.env.ROOT_RUN_START_GUARD_AUDIT) return
  fs.mkdirSync(process.env.ROOT_RUN_START_GUARD_AUDIT, { recursive: true })
  fs.writeFileSync(
    path.join(process.env.ROOT_RUN_START_GUARD_AUDIT, process.pid + '.json'),
    JSON.stringify({ pid: process.pid, nativeAttempts, compilerAttempts }) +
      '\n'
  )
})
