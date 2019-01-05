import {loader} from 'webpack'
import loaderUtils from 'loader-utils'

export type ClientPagesLoaderOptions = {
  absolutePagePath: string,
  page: string
}

const nextServerlessLoader: loader.Loader = function () {
  const {absolutePagePath, page}: any = loaderUtils.getOptions(this)
  return `
    (window.__NEXT_P=window.__NEXT_P||[]).push(['${page}', function() {
      const page = require('${absolutePagePath}')
      return { page: page.default || page }
    }]);
  `
}

export default nextServerlessLoader
