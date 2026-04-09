const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

module.exports = class IncrementalCacheHandler extends FileSystemCache {
  constructor(options) {
    super(options)
    console.log('WiringPagesIncrementalCacheHandler::constructor')
  }

  async revalidateTag(tags) {
    console.log(
      'WiringPagesIncrementalCacheHandler::revalidateTag',
      JSON.stringify(tags)
    )
    return super.revalidateTag(tags)
  }
}
