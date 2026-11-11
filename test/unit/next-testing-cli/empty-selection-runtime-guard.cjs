'use strict'
const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')
const load = Module._load
const blocked = []
const forbidden =
  /(?:\.node$|[\\/]next-swc[\\/]|[\\/]build[\\/]swc(?:[\\/]|\.js$)|[\\/]experimental[\\/]testing[\\/](?:compiler(?:[\\/]index)?|execution[\\/]execute|browser[\\/](?:server|host))\.js$)/
Module._load = function (request, parent, isMain) {
  const file = Module._resolveFilename(request, parent, isMain)
  if (typeof file === 'string' && forbidden.test(file)) {
    blocked.push(file)
    throw new Error(
      'Empty-selection verification cannot start compilation or execution: ' +
        file
    )
  }
  return Reflect.apply(load, this, [request, parent, isMain])
}
process.dlopen = function () {
  blocked.push('process.dlopen')
  throw new Error('Empty-selection verification cannot load a native addon')
}
module.exports = { blocked }
process.on('exit', () => {
  const directory = process.env.NEXT_TEST_EMPTY_GUARD_AUDIT
  if (!directory) return
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, process.pid + '.json'),
    JSON.stringify({ pid: process.pid, blocked }) + '\n'
  )
})
