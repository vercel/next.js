import webpack from 'webpack'

class CssModule extends webpack.Module {
  constructor(dependency) {
    super('css/mini-extract', dependency.context)
    this.id = ''
    this._identifier = dependency.identifier
    this._identifierIndex = dependency.identifierIndex
    this.content = dependency.content
    this.media = dependency.media
    this.sourceMap = dependency.sourceMap
  } // no source() so webpack doesn't do add stuff to the bundle

  size() {
    return this.content.length
  }

  identifier() {
    return `css ${this._identifier} ${this._identifierIndex}`
  }

  readableIdentifier(requestShortener) {
    return `css ${requestShortener.shorten(this._identifier)}${
      this._identifierIndex ? ` (${this._identifierIndex})` : ''
    }`
  }

  nameForCondition() {
    const resource = this._identifier.split('!').pop()

    const idx = resource.indexOf('?')

    if (idx >= 0) {
      return resource.substring(0, idx)
    }

    return resource
  }

  updateCacheModule(module) {
    this.content = module.content
    this.media = module.media
    this.sourceMap = module.sourceMap
  }

  needRebuild() {
    return true
  }

  build(options, compilation, resolver, fileSystem, callback) {
    this.buildInfo = {}
    this.buildMeta = {}
    callback()
  }

  updateHash(hash) {
    super.updateHash(hash)
    hash.update(this.content)
    hash.update(this.media || '')
    hash.update(this.sourceMap ? JSON.stringify(this.sourceMap) : '')
  }
}

export default CssModule
