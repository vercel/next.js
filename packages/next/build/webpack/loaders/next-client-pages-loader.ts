import { loader } from 'webpack'
import loaderUtils from 'loader-utils'
import { tracer, traceFn } from '../../tracer'

export type ClientPagesLoaderOptions = {
  absolutePagePath: string
  page: string
}

const nextClientPagesLoader: loader.Loader = function () {
  const span = tracer.startSpan('next-client-pages-loader')
  return traceFn(span, () => {
    const { absolutePagePath, page } = loaderUtils.getOptions(
      this
    ) as ClientPagesLoaderOptions

    span.setAttribute('absolutePagePath', absolutePagePath)

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
  })
}

export default nextClientPagesLoader
