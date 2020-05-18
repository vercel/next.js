import { loader } from 'webpack'
import loaderUtils from 'loader-utils'

export type ClientPagesLoaderOptions = {
  absolutePagePath: string
  page: string
}

const nextClientPagesLoader: loader.Loader = function () {
  const { absolutePagePath, page } = loaderUtils.getOptions(
    this
  ) as ClientPagesLoaderOptions
  const stringifiedAbsolutePagePath = JSON.stringify(absolutePagePath)
  const stringifiedPage = JSON.stringify(page)

  return `
    (window.__NEXT_P = window.__NEXT_P || []).push([
      ${stringifiedPage},
      function () {
        return require(${stringifiedAbsolutePagePath});
      }
    ]);
  `
}

export default nextClientPagesLoader
