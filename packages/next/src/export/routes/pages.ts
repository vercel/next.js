import type { ExportRouteResult } from '../types'
import type {
  PagesRenderContext,
  PagesSharedContext,
  RenderOpts,
} from '../../server/render'
import type { LoadComponentsReturnType } from '../../server/load-components'
import type { AmpValidation } from '../types'
import type { NextParsedUrlQuery } from '../../server/request-meta'
import type { Params } from '../../server/request/params'

import RenderResult from '../../server/render-result'
import { join } from 'path'
import type {
  MockedRequest,
  MockedResponse,
} from '../../server/lib/mock-request'
import { isInAmpMode } from '../../shared/lib/amp-mode'
import {
  NEXT_DATA_SUFFIX,
  SERVER_PROPS_EXPORT_ERROR,
} from '../../lib/constants'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import { FileType, fileExists } from '../../lib/file-exists'
import { lazyRenderPagesPage } from '../../server/route-modules/pages/module.render'
import type { MultiFileWriter } from '../../lib/multi-file-writer'

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
  ampPath: string,
  subFolders: boolean,
  outDir: string,
  ampValidatorPath: string | undefined,
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
  const ampState = {
    ampFirst: components.pageConfig?.amp === true,
    hasQuery: Boolean(query.amp),
    hybrid: components.pageConfig?.amp === 'hybrid',
  }

  if (!ampValidatorPath) {
    ampValidatorPath = require.resolve(
      'next/dist/compiled/amphtml-validator/validator_wasm.js'
    )
  }

  const inAmpMode = isInAmpMode(ampState)
  const hybridAmp = ampState.hybrid

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
    renderResult = RenderResult.fromStatic(components.Component)

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

  const ssgNotFound = renderResult?.metadata.isNotFound

  const ampValidations: AmpValidation[] = []

  const validateAmp = async (
    rawAmpHtml: string,
    ampPageName: string,
    validatorPath: string | undefined
  ) => {
    const validator = await AmpHtmlValidator.getInstance(validatorPath)
    const result = validator.validateString(rawAmpHtml)
    const errors = result.errors.filter((e) => e.severity === 'ERROR')
    const warnings = result.errors.filter((e) => e.severity !== 'ERROR')

    if (warnings.length || errors.length) {
      ampValidations.push({
        page: ampPageName,
        result: {
          errors,
          warnings,
        },
      })
    }
  }

  const html =
    renderResult && !renderResult.isNull ? renderResult.toUnchunkedString() : ''

  let ampRenderResult: RenderResult | undefined

  if (inAmpMode && !renderOpts.ampSkipValidation) {
    if (!ssgNotFound) {
      await validateAmp(html, path, ampValidatorPath)
    }
  } else if (hybridAmp) {
    const ampHtmlFilename = subFolders
      ? join(ampPath, 'index.html')
      : `${ampPath}.html`

    const ampHtmlFilepath = join(outDir, ampHtmlFilename)

    const exists = await fileExists(ampHtmlFilepath, FileType.File)
    if (!exists) {
      try {
        ampRenderResult = await lazyRenderPagesPage(
          req,
          res,
          page,
          { ...searchAndDynamicParams, amp: '1' },
          renderOpts,
          sharedContext,
          renderContext
        )
      } catch (err) {
        if (!isBailoutToCSRError(err)) throw err
      }

      const ampHtml =
        ampRenderResult && !ampRenderResult.isNull
          ? ampRenderResult.toUnchunkedString()
          : ''
      if (!renderOpts.ampSkipValidation) {
        await validateAmp(ampHtml, page + '?amp=1', ampValidatorPath)
      }

      fileWriter.append(ampHtmlFilepath, ampHtml)
    }
  }

  const metadata = renderResult?.metadata || ampRenderResult?.metadata || {}
  if (metadata.pageData) {
    const dataFile = join(
      pagesDataDir,
      htmlFilename.replace(/\.html$/, NEXT_DATA_SUFFIX)
    )

    fileWriter.append(dataFile, JSON.stringify(metadata.pageData))

    if (hybridAmp) {
      fileWriter.append(
        dataFile.replace(/\.json$/, '.amp.json'),
        JSON.stringify(metadata.pageData)
      )
    }
  }

  if (!ssgNotFound) {
    // don't attempt writing to disk if getStaticProps returned not found
    fileWriter.append(htmlFilepath, html)
  }

  return {
    ampValidations,
    revalidate: metadata.revalidate ?? false,
    ssgNotFound,
  }
}
