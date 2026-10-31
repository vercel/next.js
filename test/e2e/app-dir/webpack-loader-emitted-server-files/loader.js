const path = require('path')

module.exports = function (source) {
  const name = `${path.basename(this.resourcePath, '.template')}.txt`
  this.emitFile(`loader-output/${name}`, source)
  const output = this.getOptions().development
    ? `.next/dev/server/loader-output/${name}`
    : `.next/server/chunks/loader-output/${name}`
  return `
    module.exports = function readEmittedFile() {
      return require('fs').readFileSync(
        require('path').join(process.cwd(), ${JSON.stringify(output)}), 'utf8'
      )
    }
  `
}
