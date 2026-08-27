const { appendFileSync } = require('node:fs')
const { join } = require('node:path')

module.exports = function lazyRebuildLoader(content) {
  appendFileSync(join(this.rootContext, 'lazy-rebuild-probe.log'), 'compiled\n')
  return content
}
