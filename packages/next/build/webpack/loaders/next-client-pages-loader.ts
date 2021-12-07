import { stringifyRequest } from '../stringify-request'

export type ClientPagesLoaderOptions = {
  absolutePagePath: string
  page: string
}

// this parameter: https://www.typescriptlang.org/docs/handbook/functions.html#this-parameters
function nextClientPagesLoader(this: any) {
  const pagesLoaderSpan = this.currentTraceSpan.traceChild(
    'next-client-pages-loader'
  )

  return pagesLoaderSpan.traceFn(() => {
    const { absolutePagePath, page } =
      this.getOptions() as ClientPagesLoaderOptions

    pagesLoaderSpan.setAttribute('absolutePagePath', absolutePagePath)

    const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
    const stringifiedPage = JSON.stringify(page)

    return `
    (window.__NEXT_P = window.__NEXT_P || []).push([
      ${stringifiedPage},
      function () {
        return require(${stringifiedPagePath});
      }
    ]);
    if(module.hot) {
      module.hot.dispose(function () {
        window.__NEXT_P.push([${stringifiedPage}])
      });
    }
  `
  })
}

export default nextClientPagesLoader
