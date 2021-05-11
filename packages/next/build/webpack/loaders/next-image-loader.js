import loaderUtils from 'next/dist/compiled/loader-utils'
import sizeOf from 'image-size'

function nextImageLoader(content) {
  this.cacheable && this.cacheable(true)
  this.addDependency(this.resourcePath)

  const query = loaderUtils.getOptions(this)
  const context = query.context || this.rootContext || this.options.context
  const regExp = query.regExp
  const opts = { context, content, regExp }
  const interpolatedName = loaderUtils.interpolateName(
    this,
    '/[path][name].[ext]',
    opts
  )

  if (interpolatedName.slice(0, 7) !== '/public') {
    const err = new Error(
      'Static Image loader used with filepath not in the /public directory: ' +
        interpolatedName
    )
    this.emitError(err)
  }

  const src = interpolatedName.slice(7)
  const imageSize = sizeOf(this.resourcePath)
  const stringifiedData = JSON.stringify({
    src,
    height: imageSize.height,
    width: imageSize.width,
  })

  const esModule = typeof query.esModule !== 'undefined' ? query.esModule : true
  return `${
    esModule ? 'export default' : 'module.exports ='
  } ${stringifiedData};`
}

export default nextImageLoader
