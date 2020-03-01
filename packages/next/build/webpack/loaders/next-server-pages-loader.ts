import { loader } from 'webpack'
import loaderUtils from 'loader-utils'

export type ServerPagesLoaderOptions = {
  absolutePagePath: string
  page: string
}

const nextServerPagesLoader: loader.Loader = function() {
  const { absolutePagePath }: any = loaderUtils.getOptions(this)
  const stringifiedAbsolutePagePath = JSON.stringify(absolutePagePath)

  return `
    module.exports = require(${stringifiedAbsolutePagePath})
  `
}

export default nextServerPagesLoader
