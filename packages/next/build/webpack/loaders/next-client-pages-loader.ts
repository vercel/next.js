import {loader} from 'webpack'
import loaderUtils from 'loader-utils'

export type ClientPagesLoaderOptions = {
  absolutePagePath: string,
  page: string
}

const nextServerlessLoader: loader.Loader = function () {
  const {absolutePagePath, page}: any = loaderUtils.getOptions(this)
  const stringifiedAbsolutePagePath = JSON.stringify(absolutePagePath)
  const stringifiedPage = JSON.stringify(page)

  return `
    (window.__NEXT_P=window.__NEXT_P||[]).push([${stringifiedPage}, function() {
      var page = require(${stringifiedAbsolutePagePath})
      if(module.hot) {
        module.hot.accept(${stringifiedAbsolutePagePath}, function() {
          var currentValue = next.router.components[${stringifiedPage}]
          console.log(currentValue)
          if(!currentValue) return
          var updatedPage = require(${stringifiedAbsolutePagePath})
          next.router.update(${stringifiedPage}, updatedPage.default || updatedPage)
        })
      }
      return { page: page.default || page }
    }]);
  `
}

export default nextServerlessLoader
