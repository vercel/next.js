const path = require('path')

module.exports = function (source) {
  const { outputPath } = this.getOptions()
  const name = path.basename(this.resourcePath, '.emit')
  const file = `${outputPath}/${name}.txt`
  this.emitFile(file, 'overwritten')
  this.emitFile(file, source, {
    version: 3,
    sources: [this.resourcePath],
    names: [],
    mappings: '',
  })
  this.emitFile(`${outputPath}/${name}.bin`, Buffer.from([0, 255, 128, 10]))
  this.emitFile(`${outputPath}/${name}.empty`, '')
  this.emitFile(`${outputPath}/${name}.empty-bin`, Buffer.alloc(0))
  this.emitFile(`${outputPath}/${name}.overwrite`, 'first-rule')
  if (outputPath.startsWith('..')) {
    this.emitFile(`loader-output/${name}.txt`, source)
  }
  if (name === 'server' && process.platform !== 'win32') {
    this.emitFile(`${outputPath}/literal\\name.txt`, 'backslash')
    this.emitFile(`${outputPath}/literal/name.txt`, 'slash')
  }
  if (name === 'server') {
    this.emitFile(`${outputPath}/query.txt?version=1`, 'query-content')
    this.emitFile(`${outputPath}/query.txt?version=2`, 'query-content')
  }
  return `export default ${JSON.stringify(`/_next/static/media/${name}.txt`)}`
}
