const path = require('node:path')
const fs = require('node:fs')

const compilations = new WeakMap()
let simpleCounter = 0
let compCounter = 0

module.exports = function (source) {
  // Only process files that contain the $token marker
  if (!source.includes('$token')) {
    return source
  }

  // Simple counter — increments on every loader call
  simpleCounter++

  // Compilation counter — only increments on new compilations
  if (this._compilation && !compilations.has(this._compilation)) {
    compilations.set(this._compilation, true)
    compCounter++
  }

  // Read token.json and register as dependency
  const tokenPath = path.resolve(path.dirname(this.resourcePath), 'token.json')
  this.addDependency(tokenPath)
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))

  return source
    .replace(/\$token/g, JSON.stringify(token.value))
    .replace(/\$simpleCounter/g, String(simpleCounter))
    .replace(/\$compCounter/g, String(compCounter))
}
