const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

module.exports = class IncrementalCacheHandler extends FileSystemCache {
  constructor(options) {
    super(options)
    console.log('WiringIncrementalCacheHandler::constructor')
  }
}
