import { join } from 'path'
import { stringify } from 'querystring'
import { PAGES_DIR_ALIAS, DOT_NEXT_ALIAS } from '../lib/constants'
import { ServerlessLoaderQuery } from './webpack/loaders/next-serverless-loader'

type PagesMapping = {
  [page: string]: string
}

export function createPagesMapping(
  pagePaths: string[],
  extensions: string[]
): PagesMapping {
  const pages: PagesMapping = pagePaths.reduce(
    (result: PagesMapping, pagePath): PagesMapping => {
      let page = `${pagePath
        .replace(new RegExp(`\\.+(${extensions.join('|')})$`), '')
        .replace(/\\/g, '/')}`.replace(/\/index$/, '')
      page = page === '/index' ? '/' : page

      result[page === '' ? '/' : page] = join(
        PAGES_DIR_ALIAS,
        pagePath
      ).replace(/\\/g, '/')
      return result
    },
    {}
  )

  pages['/_app'] = pages['/_app'] || 'next/dist/pages/_app'
  pages['/_error'] = pages['/_error'] || 'next/dist/pages/_error'
  pages['/_document'] = pages['/_document'] || 'next/dist/pages/_document'

  return pages
}

export type WebpackEntrypoints = {
  [bundle: string]: string | string[]
}

type Entrypoints = {
  client: WebpackEntrypoints
  server: WebpackEntrypoints
}

export function createEntrypoints(
  pages: PagesMapping,
  target: 'server' | 'serverless',
  buildId: string,
  dynamicBuildId: boolean,
  config: any
): Entrypoints {
  const client: WebpackEntrypoints = {}
  const server: WebpackEntrypoints = {}

  const defaultServerlessOptions = {
    absoluteAppPath: pages['/_app'],
    absoluteDocumentPath: pages['/_document'],
    absoluteErrorPath: pages['/_error'],
    distDir: DOT_NEXT_ALIAS,
    assetPrefix: config.assetPrefix,
    generateEtags: config.generateEtags,
    ampBindInitData: config.experimental.ampBindInitData,
    canonicalBase: config.canonicalBase,
    dynamicBuildId,
  }

  Object.keys(pages).forEach(page => {
    const absolutePagePath = pages[page]
    const bundleFile = page === '/' ? '/index.js' : `${page}.js`
    const isApiRoute = bundleFile.startsWith('/api')

    const bundlePath = join('static', buildId, 'pages', bundleFile)
    if (isApiRoute || target === 'server') {
      server[bundlePath] = [absolutePagePath]
    } else if (
      target === 'serverless' &&
      page !== '/_app' &&
      page !== '/_document'
    ) {
      const serverlessLoaderOptions: ServerlessLoaderQuery = {
        page,
        absolutePagePath,
        ...defaultServerlessOptions,
      }
      server[join('pages', bundleFile)] = `next-serverless-loader?${stringify(
        serverlessLoaderOptions
      )}!`
    }

    if (page === '/_document') {
      return
    }

    if (!isApiRoute) {
      client[bundlePath] = `next-client-pages-loader?${stringify({
        page,
        absolutePagePath,
      })}!`
    }
  })

  return {
    client,
    server,
  }
}
