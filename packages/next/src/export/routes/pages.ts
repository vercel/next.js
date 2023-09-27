import type { ExportPageResult } from '../types'
import type { PagesRender, RenderOpts } from '../../server/render'
import type { LoadComponentsReturnType } from '../../server/load-components'
import type { AmpValidation } from '../types'
import type { NextParsedUrlQuery } from '../../server/request-meta'

import fs from 'fs/promises'
import RenderResult from '../../server/render-result'
import { dirname, join } from 'path'
import { MockedRequest, MockedResponse } from '../../server/lib/mock-request'
import { isInAmpMode } from '../../shared/lib/amp-mode'
import { SERVER_PROPS_EXPORT_ERROR } from '../../lib/constants'
import { NEXT_DYNAMIC_NO_SSR_CODE } from '../../shared/lib/lazy-dynamic/no-ssr-error'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import { FileType, fileExists } from '../../lib/file-exists'

/**
 * Lazily loads and runs the app page render function.
 */
const render: PagesRender = (...args) => {
  return require('../../server/future/route-modules/pages/module.compiled').renderToHTML(
    ...args
  )
}

export async function exportPages(
  req: MockedRequest,
  res: MockedResponse,
  path: string,
  page: string,
  query: NextParsedUrlQuery,
  htmlFilepath: string,
  htmlFilename: string,
  ampPath: string,
  subFolders: boolean,
  outDir: string,
  ampValidatorPath: string | undefined,
  pagesDataDir: string,
  buildExport: boolean,
  isDynamic: boolean,
  hasOrigQueryValues: boolean,
  renderOpts: RenderOpts,
  components: LoadComponentsReturnType
): Promise<ExportPageResult> {
  const ampState = {
    ampFirst: components.pageConfig?.amp === true,
    hasQuery: Boolean(query.amp),
    hybrid: components.pageConfig?.amp === 'hybrid',
  }

  const inAmpMode = isInAmpMode(ampState)
  const hybridAmp = ampState.hybrid

  if (components.getServerSideProps) {
    throw new Error(`Error for page ${page}: ${SERVER_PROPS_EXPORT_ERROR}`)
  }

  // for non-dynamic SSG pages we should have already
  // prerendered the file
  if (!buildExport && components.getStaticProps && !isDynamic) {
    return {}
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
     * This sets environment variable to be used at the time of static export by head.tsx.
     * Using this from process.env allows targeting SSR by calling
     * `process.env.__NEXT_OPTIMIZE_FONTS`.
     * TODO(prateekbh@): Remove this when experimental.optimizeFonts are being cleaned up.
     */
    if (renderOpts.optimizeFonts) {
      process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(
        renderOpts.optimizeFonts
      )
    }
    if (renderOpts.optimizeCss) {
      process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true)
    }
    try {
      renderResult = await render(req, res, page, query, renderOpts)
    } catch (err: any) {
      if (err.digest !== NEXT_DYNAMIC_NO_SSR_CODE) {
        throw err
      }
    }
  }

  const ssgNotFound = renderResult?.metadata.isNotFound

  const ampValidations: AmpValidation[] = []

  const validateAmp = async (
    rawAmpHtml: string,
    ampPageName: string,
    validatorPath?: string
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

    const ampBaseDir = join(outDir, dirname(ampHtmlFilename))
    const ampHtmlFilepath = join(outDir, ampHtmlFilename)

    const exists = await fileExists(ampHtmlFilepath, FileType.File)
    if (!exists) {
      try {
        ampRenderResult = await render(
          req,
          res,
          page,
          { ...query, amp: '1' },
          renderOpts
        )
      } catch (err: any) {
        if (err.digest !== NEXT_DYNAMIC_NO_SSR_CODE) {
          throw err
        }
      }

      const ampHtml =
        ampRenderResult && !ampRenderResult.isNull
          ? ampRenderResult.toUnchunkedString()
          : ''
      if (!renderOpts.ampSkipValidation) {
        await validateAmp(ampHtml, page + '?amp=1')
      }
      await fs.mkdir(ampBaseDir, { recursive: true })
      await fs.writeFile(ampHtmlFilepath, ampHtml, 'utf8')
    }
  }

  const metadata = renderResult?.metadata || ampRenderResult?.metadata || {}
  if (metadata.pageData) {
    const dataFile = join(
      pagesDataDir,
      htmlFilename.replace(/\.html$/, '.json')
    )

    await fs.mkdir(dirname(dataFile), { recursive: true })
    await fs.writeFile(dataFile, JSON.stringify(metadata.pageData), 'utf8')

    if (hybridAmp) {
      await fs.writeFile(
        dataFile.replace(/\.json$/, '.amp.json'),
        JSON.stringify(metadata.pageData),
        'utf8'
      )
    }
  }

  if (!ssgNotFound) {
    // don't attempt writing to disk if getStaticProps returned not found
    await fs.writeFile(htmlFilepath, html, 'utf8')
  }

  return {
    ampValidations,
    fromBuildExportRevalidate: metadata.revalidate,
    ssgNotFound,
  }
}
