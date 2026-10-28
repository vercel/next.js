module.exports = function (source) {
  const options = this.getOptions()
  if (options.invalidName) {
    this.emitFile(null, source)
  } else if (options.ignoredInfo) {
    this.emitFile('ignored-info.txt', source, undefined, {
      custom: () => {},
      get immutable() {
        throw new Error('assetInfo must not be read')
      },
    })
    this.emitFile('minimized.js', source, undefined, { minimized: true })
  } else if (options.mutableBuffer) {
    const content = Buffer.from([0])
    this.emitFile('mutable.bin', content)
    content[0] = 255
  } else if (options.duplicate) {
    this.emitFile('nested\\asset.txt', 'first')
    this.emitFile('nested/asset.txt', 'middle')
    this.emitFile('nested/asset.txt', 'last')
  } else if (options.map) {
    this.emitFile('mapped.txt', source, {
      version: 3,
      sources: ['input.emit'],
      mappings: '',
    })
  } else if (!options.noEmit) {
    this.emitFile('text.txt', source, null, { immutable: true })
    this.emitFile('binary.bin', Buffer.from([0, 255, 128, 10]))
    this.emitFile('empty.txt', '')
    this.emitFile('empty.bin', Buffer.alloc(0))
  }
  return `export default ${JSON.stringify(source)}`
}

module.exports.pitch = function () {
  if (this.getOptions().pitch) {
    this.emitFile('pitch.txt', 'pitched')
    return 'export default "pitched"'
  }
}
