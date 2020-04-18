import { loader } from 'webpack'
import loaderUtils from 'loader-utils'

export type ClientPagesLoaderOptions = {
  absolutePagePath: string
  page: string
  hotRouterUpdates: boolean
}

const nextClientPagesLoader: loader.Loader = function() {
  const { absolutePagePath, page, hotRouterUpdates } = loaderUtils.getOptions(
    this
  ) as ClientPagesLoaderOptions
  const stringifiedAbsolutePagePath = JSON.stringify(absolutePagePath)
  const stringifiedPage = JSON.stringify(page)

  return `
    (window.__NEXT_P = window.__NEXT_P || []).push([
      ${stringifiedPage},
      function () {
        var mod = require(${stringifiedAbsolutePagePath});
        if (${!!hotRouterUpdates} && module.hot) {
          module.hot.accept(${stringifiedAbsolutePagePath}, function () {
            if (!next.router.components[${stringifiedPage}]) return;
            var updatedPage = require(${stringifiedAbsolutePagePath});
            next.router.update(${stringifiedPage}, updatedPage);
          });
        }
        return mod;
      }
    ]);
  `
}

export default nextClientPagesLoader
