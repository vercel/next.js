import devalue from 'next/dist/compiled/devalue'
import escapeRegexp from 'next/dist/compiled/escape-string-regexp'
import { join } from 'path'
import { parse } from 'querystring'
import { loader } from 'webpack'
import { API_ROUTE } from '../../../../lib/constants'
import { isDynamicRoute } from '../../../../next-server/lib/router/utils'
import { __ApiPreviewProps } from '../../../../next-server/server/api-utils'
import {
  BUILD_MANIFEST,
  ROUTES_MANIFEST,
  REACT_LOADABLE_MANIFEST,
} from '../../../../next-server/lib/constants'

export type ServerlessLoaderQuery = {
  page: string
  distDir: string
  absolutePagePath: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absoluteErrorPath: string
  absolute404Path: string
  buildId: string
  assetPrefix: string
  generateEtags: string
  poweredByHeader: string
  canonicalBase: string
  basePath: string
  runtimeConfig: string
  previewProps: string
  loadedEnvFiles: string
  i18n: string
}

const nextServerlessLoader: loader.Loader = function () {
  const {
    distDir,
    absolutePagePath,
    page,
    buildId,
    canonicalBase,
    assetPrefix,
    absoluteAppPath,
    absoluteDocumentPath,
    absoluteErrorPath,
    absolute404Path,
    generateEtags,
    poweredByHeader,
    basePath,
    runtimeConfig,
    previewProps,
    loadedEnvFiles,
    i18n,
  }: ServerlessLoaderQuery =
    typeof this.query === 'string' ? parse(this.query.substr(1)) : this.query

  const buildManifest = join(distDir, BUILD_MANIFEST).replace(/\\/g, '/')
  const reactLoadableManifest = join(distDir, REACT_LOADABLE_MANIFEST).replace(
    /\\/g,
    '/'
  )
  const routesManifest = join(distDir, ROUTES_MANIFEST).replace(/\\/g, '/')

  const escapedBuildId = escapeRegexp(buildId)
  const pageIsDynamicRoute = isDynamicRoute(page)

  const encodedPreviewProps = devalue(
    JSON.parse(previewProps) as __ApiPreviewProps
  )

  const envLoading = `
    const { processEnv } = require('@next/env')
    processEnv(${Buffer.from(loadedEnvFiles, 'base64').toString()})
  `

  const runtimeConfigImports = runtimeConfig
    ? `
      const { setConfig } = require('next/config')
    `
    : ''

  const runtimeConfigSetter = runtimeConfig
    ? `
      const runtimeConfig = ${runtimeConfig}
      setConfig(runtimeConfig)
    `
    : 'const runtimeConfig = {}'

  if (page.match(API_ROUTE)) {
    return `
      ${envLoading}
      ${runtimeConfigImports}
      ${
        /*
          this needs to be called first so its available for any other imports
        */
        runtimeConfigSetter
      }
      import initServer from 'next-plugin-loader?middleware=on-init-server!'
      import onError from 'next-plugin-loader?middleware=on-error-server!'
      import 'next/dist/next-server/server/node-polyfill-fetch'
      import { rewrites } from '${routesManifest}'

      import { getApiHandler } from 'next/dist/build/webpack/loaders/next-serverless-loader/api-handler'

      const apiHandler = getApiHandler({
        pageModule: require("${absolutePagePath}"),
        rewrites,
        i18n: ${i18n || 'undefined'},
        page: "${page}",
        basePath: "${basePath}",
        pageIsDynamic: ${pageIsDynamicRoute},
        encodedPreviewProps: ${encodedPreviewProps},
        experimental: {
          onError,
          initServer,
        }
      })
      export default apiHandler
    `
  } else {
    return `
    import initServer from 'next-plugin-loader?middleware=on-init-server!'
    import onError from 'next-plugin-loader?middleware=on-error-server!'
    import 'next/dist/next-server/server/node-polyfill-fetch'
    import { rewrites } from '${routesManifest}'
    import buildManifest from '${buildManifest}'
    import reactLoadableManifest from '${reactLoadableManifest}'

    ${envLoading}
    ${runtimeConfigImports}
    ${
      // this needs to be called first so its available for any other imports
      runtimeConfigSetter
    }
    import { getPageHandler } from 'next/dist/build/webpack/loaders/next-serverless-loader/page-handler'

    const appMod = require('${absoluteAppPath}')
    let App = appMod.default || appMod.then && appMod.then(mod => mod.default);

    const compMod = require('${absolutePagePath}')

    const Component = compMod.default || compMod.then && compMod.then(mod => mod.default)
    export default Component
    export const getStaticProps = compMod['getStaticProp' + 's'] || compMod.then && compMod.then(mod => mod['getStaticProp' + 's'])
    export const getStaticPaths = compMod['getStaticPath' + 's'] || compMod.then && compMod.then(mod => mod['getStaticPath' + 's'])
    export const getServerSideProps = compMod['getServerSideProp' + 's'] || compMod.then && compMod.then(mod => mod['getServerSideProp' + 's'])

    // kept for detecting legacy exports
    export const unstable_getStaticParams = compMod['unstable_getStaticParam' + 's'] || compMod.then && compMod.then(mod => mod['unstable_getStaticParam' + 's'])
    export const unstable_getStaticProps = compMod['unstable_getStaticProp' + 's'] || compMod.then && compMod.then(mod => mod['unstable_getStaticProp' + 's'])
    export const unstable_getStaticPaths = compMod['unstable_getStaticPath' + 's'] || compMod.then && compMod.then(mod => mod['unstable_getStaticPath' + 's'])
    export const unstable_getServerProps = compMod['unstable_getServerProp' + 's'] || compMod.then && compMod.then(mod => mod['unstable_getServerProp' + 's'])

    export let config = compMod['confi' + 'g'] || (compMod.then && compMod.then(mod => mod['confi' + 'g'])) || {}
    export const _app = App

    const { renderReqToHTML, render } = getPageHandler({
      pageModule: compMod,
      pageComponent: Component,
      pageConfig: config,
      appModule: App,
      documentModule: require("${absoluteDocumentPath}"),
      errorModule: require("${absoluteErrorPath}"),
      notFoundModule: ${
        absolute404Path ? `require("${absolute404Path}")` : undefined
      },
      pageGetStaticProps: getStaticProps,
      pageGetStaticPaths: getStaticPaths,
      pageGetServerSideProps: getServerSideProps,

      assetPrefix: "${assetPrefix}",
      canonicalBase: "${canonicalBase}",
      generateEtags: ${generateEtags || 'false'},
      poweredByHeader: ${poweredByHeader || 'false'},

      runtimeConfig,
      buildManifest,
      reactLoadableManifest,

      rewrites,
      i18n: ${i18n || 'undefined'},
      page: "${page}",
      buildId: "${buildId}",
      escapedBuildId: "${escapedBuildId}",
      basePath: "${basePath}",
      pageIsDynamic: ${pageIsDynamicRoute},
      encodedPreviewProps: ${encodedPreviewProps},
      experimental: {
        onError,
        initServer,
      }
    })
    export { renderReqToHTML, render }
  `
  }
}

export default nextServerlessLoader
