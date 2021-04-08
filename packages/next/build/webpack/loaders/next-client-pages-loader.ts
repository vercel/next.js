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
        const mod = require(${stringifiedAbsolutePagePath});
        ${
          page === '/_app'
            ? `
          const bufferedMetrics = window.__NEXT_REPORT_WEB_VITALS;
          window.__NEXT_REPORT_WEB_VITALS = { push: mod.reportWebVitals || function() {} };
          if (Array.isArray(bufferedMetrics)) {
            bufferedMetrics.forEach(window.__NEXT_REPORT_WEB_VITALS.push)
          }
        `
            : ``
        }
        return mod;
      }
    ]);
  `
  })
}

export default nextClientPagesLoader
