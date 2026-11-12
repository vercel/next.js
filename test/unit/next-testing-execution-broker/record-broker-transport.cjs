const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { compileFunction } = require('node:vm')

// V8 IPC clones belong to Node's native realm. Keep this added transport
// helper's fixtures and strict expected values in that same realm.
const filename = join(__dirname, 'record-broker-transport-body.cjs')
const body = { exports: {} }
compileFunction(
  readFileSync(filename, 'utf8'),
  ['require', 'module', 'exports'],
  {
    filename,
  }
)(require, body, body.exports)
module.exports = body.exports
