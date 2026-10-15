// Source-host control. The separate public gate qualifies real native emission.
const { pathToFileURL } = require('node:url')
const { join } = require('node:path')
const paths = require('./runtime-paths.json')
const { validateIndex } = require('./helper.cjs')
exports.testRunner = require(paths.runner)
exports.loadTestModule = (index) => {
  validateIndex(index)
  return import(pathToFileURL(join(paths.project, paths.files[index])).href)
}
