import type { ExportRouteResult } from '../types'
import type {
  PagesRenderContext,
  PagesSharedContext,
  RenderOpts,
} from '../../server/render'
import type { LoadComponentsReturnType } from '../../server/load-components'
import type { NextParsedUrlQuery } from '../../server/request-meta'
import type { Params } from '../../server/request/params'

import RenderResult from '../../server/render-result'
import { join } from 'path'
import type {
  MockedRequest,
  MockedResponse,
} from '../../server/lib/mock-request'
import { createRequestResponseMocks } from '../../server/lib/mock-request'
import {
  HTML_CONTENT_TYPE_HEADER,
  NEXT_DATA_SUFFIX,
  SERVER_PROPS_EXPORT_ERROR,
} from '../../lib/constants'
import { getMarkdownRouteConfig } from '../../server/markdown/config'
import { markdownDocumentRepresentation } from '../../server/markdown/representation'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { interopDefault } from '../../lib/interop-default'
import { lazyRenderPagesPage } from '../../server/route-modules/pages/module.render'
import type { MultiFileWriter } from '../../lib/multi-file-writer'
import { getRequestMeta, setRequestMeta } from '../../server/request-meta'

/**
 * Renders & exports a page associated with the /pages directory
 */
export async function exportPagesPage(
  req: MockedRequest,
  res: MockedResponse,
  path: string,
  page: string,
  query: NextParsedUrlQuery,
  params: Params | undefined,
  htmlFilepath: string,
  htmlFilename: string,
  pagesDataDir: string,
  buildExport: boolean,
  isDynamic: boolean,
  sharedContext: PagesSharedContext,
  renderContext: PagesRenderContext,
  hasOrigQueryValues: boolean,
  renderOpts: RenderOpts,
  components: LoadComponentsReturnType,
  fileWriter: MultiFileWriter
): Promise<ExportRouteResult | undefined> {
  if (components.getServerSideProps) {
    throw new Error(`Error for page ${page}: ${SERVER_PROPS_EXPORT_ERROR}`)
  }

  // for non-dynamic SSG pages we should have already
  // prerendered the file
  if (!buildExport && components.getStaticProps && !isDynamic) {
    return
  }

  // Pages router merges page params (e.g. [lang]) with query params
  // primarily to support them both being accessible on `useRouter().query`.
  // If we extracted dynamic params from the path, we need to merge them
  // back into the query object.
  const searchAndDynamicParams = {
    ...query,
    ...params,
  }

  if (components.getStaticProps && !htmlFilepath.endsWith('.html')) {
    // make sure it ends with .html if the name contains a dot
    htmlFilepath += '.html'
    htmlFilename += '.html'
  }

  let renderResult: RenderResult | undefined

  if (typeof components.Component === 'string') {
    renderResult = RenderResult.fromStatic(
      components.Component,
      HTML_CONTENT_TYPE_HEADER
    )

    if (hasOrigQueryValues) {
      throw new Error(
        `\nError: you provided query values for ${path} which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add \`getInitialProps\`\n`
      )
    }
  } else {
    /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targeting SSR by calling
     * `process.env.__NEXT_OPTIMIZE_CSS`.
     */
    if (renderOpts.optimizeCss) {
      process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true)
    }
    try {
      renderResult = await lazyRenderPagesPage(
        req,
        res,
        page,
        searchAndDynamicParams,
        renderOpts,
        sharedContext,
        renderContext
      )
    } catch (err) {
      if (!isBailoutToCSRError(err)) throw err
    }
  }

  const markdownRoute = getMarkdownRouteConfig(
    renderOpts.ComponentMod as {
      markdown?: unknown
      generateMarkdown?: unknown
    }
  )

  if (renderOpts.experimental.markdown === true && markdownRoute.enabled) {
    const markdownFilepath = htmlFilepath.replace(/\.html$/, '.markdown')
    const { req: markdownReq, res: markdownRes } = createRequestResponseMocks({
      url: req.url || path,
      method: 'GET',
      headers: {
        ...req.headers,
        accept: markdownDocumentRepresentation.contentType,
      },
    })

    markdownRes.statusCode = res.statusCode
    setRequestMeta(markdownReq, { ...getRequestMeta(req) })

    const markdownRenderOpts =
      typeof renderOpts.Component === 'string'
        ? {
            ...renderOpts,
            Component: interopDefault(renderOpts.ComponentMod),
          }
        : renderOpts

    const markdownResult = await lazyRenderPagesPage(
      markdownReq,
      markdownRes,
      page,
      searchAndDynamicParams,
      markdownRenderOpts,
      sharedContext,
      renderContext
    )

    if (markdownResult && !markdownResult.isNull) {
      fileWriter.append(markdownFilepath, markdownResult.toUnchunkedString())
    }
  }

  const ssgNotFound = renderResult?.metadata.isNotFound

  const html =
    renderResult && !renderResult.isNull ? renderResult.toUnchunkedString() : ''

  const metadata = renderResult?.metadata || {}
  if (metadata.pageData) {
    const dataFile = join(
      pagesDataDir,
      htmlFilename.replace(/\.html$/, NEXT_DATA_SUFFIX)
    )

    fileWriter.append(dataFile, JSON.stringify(metadata.pageData))
  }

  if (!ssgNotFound) {
    // don't attempt writing to disk if getStaticProps returned not found
    fileWriter.append(htmlFilepath, html)
  }

  return {
    cacheControl: metadata.cacheControl ?? {
      revalidate: false,
      expire: undefined,
    },
    ssgNotFound,
  }
}
