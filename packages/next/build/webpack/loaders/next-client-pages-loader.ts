import loaderUtils from 'next/dist/compiled/loader-utils'

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
    const { absolutePagePath, page } = loaderUtils.getOptions(
      this
    ) as ClientPagesLoaderOptions

    pagesLoaderSpan.setAttribute('absolutePagePath', absolutePagePath)

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
