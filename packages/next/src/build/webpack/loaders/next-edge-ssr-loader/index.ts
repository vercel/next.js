import type webpack from 'webpack'
import type { SizeLimit } from '../../../../../types'
import type { PagesRouteModuleOptions } from '../../../../server/future/route-modules/pages/module'
import type { MiddlewareConfig } from '../../../analysis/get-page-static-info'

import { getModuleBuildInfo } from '../get-module-build-info'
import { WEBPACK_RESOURCE_QUERIES } from '../../../../lib/constants'
import { stringifyRequest } from '../../stringify-request'
import { RouteKind } from '../../../../server/future/route-kind'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'

export type EdgeSSRLoaderQuery = {
  absolute500Path: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absoluteErrorPath: string
  absolutePagePath: string
  buildId: string
  dev: boolean
  isServerComponent: boolean
  page: string
  stringifiedConfig: string
  appDirLoader?: string
  pagesType: 'app' | 'pages' | 'root'
  sriEnabled: boolean
  incrementalCacheHandlerPath?: string
  preferredRegion: string | string[] | undefined
  middlewareConfig: string
  serverActionsBodySizeLimit?: SizeLimit
}

/*
For pages SSR'd at the edge, we bundle them with the ESM version of Next in order to
benefit from the better tree-shaking and thus, smaller bundle sizes.

The absolute paths for _app, _error and _document, used in this loader, link to the regular CJS modules.
They are generated in `createPagesMapping` where we don't have access to `isEdgeRuntime`,
so we have to do it here. It's not that bad because it keeps all references to ESM modules magic in this place.
*/
function swapDistFolderWithEsmDistFolder(path: string) {
  return path.replace('next/dist/pages', 'next/dist/esm/pages')
}

function getRouteModuleOptions(page: string) {
  const options: Omit<PagesRouteModuleOptions, 'userland' | 'components'> = {
    definition: {
      kind: RouteKind.PAGES,
      page: normalizePagePath(page),
      pathname: page,
      // The following aren't used in production.
      identity: '',
      bundlePath: '',
      filename: '',
    },
  }

  return options
}

const edgeSSRLoader: webpack.LoaderDefinitionFunction<EdgeSSRLoaderQuery> =
  function edgeSSRLoader(this) {
    const {
      dev,
      page,
      buildId,
      absolutePagePath,
      absoluteAppPath,
      absoluteDocumentPath,
      absolute500Path,
      absoluteErrorPath,
      isServerComponent,
      stringifiedConfig: stringifiedConfigBase64,
      appDirLoader: appDirLoaderBase64,
      pagesType,
      sriEnabled,
      incrementalCacheHandlerPath,
      preferredRegion,
      middlewareConfig: middlewareConfigBase64,
      serverActionsBodySizeLimit,
    } = this.getOptions()

    const middlewareConfig: MiddlewareConfig = JSON.parse(
      Buffer.from(middlewareConfigBase64, 'base64').toString()
    )

    const stringifiedConfig = Buffer.from(
      stringifiedConfigBase64 || '',
      'base64'
    ).toString()
    const appDirLoader = Buffer.from(
      appDirLoaderBase64 || '',
      'base64'
    ).toString()
    const isAppDir = pagesType === 'app'

    const buildInfo = getModuleBuildInfo(this._module as any)
    buildInfo.nextEdgeSSR = {
      // @ts-expect-error === 'true' is correct because loader options are serialized as searchParams. Type needs to be fixed somehow.
      isServerComponent: isServerComponent === 'true',
      page: page,
      isAppDir,
    }
    buildInfo.route = {
      page,
      absolutePagePath,
      preferredRegion,
      middlewareConfig,
    }

    const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
    const stringifiedAppPath = stringifyRequest(
      this,
      swapDistFolderWithEsmDistFolder(absoluteAppPath)
    )
    const stringifiedErrorPath = stringifyRequest(
      this,
      swapDistFolderWithEsmDistFolder(absoluteErrorPath)
    )
    const stringifiedDocumentPath = stringifyRequest(
      this,
      swapDistFolderWithEsmDistFolder(absoluteDocumentPath)
    )
    const stringified500Path = absolute500Path
      ? stringifyRequest(this, absolute500Path)
      : null

    const pageModPath = `${appDirLoader}${stringifiedPagePath.substring(
      1,
      stringifiedPagePath.length - 1
    )}${isAppDir ? `?${WEBPACK_RESOURCE_QUERIES.edgeSSREntry}` : ''}`

    const transformed = `
    import 'next/dist/esm/server/web/globals'
    import { adapter } from 'next/dist/esm/server/web/adapter'
    import { getRender } from 'next/dist/esm/build/webpack/loaders/next-edge-ssr-loader/render'
    import { IncrementalCache } from 'next/dist/esm/server/lib/incremental-cache'

    const pagesType = ${JSON.stringify(pagesType)}
    ${
      isAppDir
        ? `
      import { renderToHTMLOrFlight as renderToHTML } from 'next/dist/esm/server/app-render/app-render'
      import * as pageMod from ${JSON.stringify(pageModPath)}
      const Document = null
      const appMod = null
      const errorMod = null
      const error500Mod = null
    `
        : `
      import Document from ${stringifiedDocumentPath}
      import * as appMod from ${stringifiedAppPath}
      import * as userlandPage from ${stringifiedPagePath}
      import * as userlandErrorPage from ${stringifiedErrorPath}
      ${
        stringified500Path
          ? `import * as userland500Page from ${stringified500Path}`
          : ''
      }

      // TODO: re-enable this once we've refactored to use implicit matches
      // const renderToHTML = undefined

      import { renderToHTML } from 'next/dist/esm/server/render'
      import RouteModule from "next/dist/esm/server/future/route-modules/pages/module"

      const pageMod = {
        ...userlandPage,
        routeModule: new RouteModule({
          ...${JSON.stringify(getRouteModuleOptions(page))},
          components: {
            App: appMod.default,
            Document,
          },
          userland: userlandPage,
        }),
      }

      const errorMod = {
        ...userlandErrorPage,
        routeModule: new RouteModule({
          ...${JSON.stringify(getRouteModuleOptions('/_error'))},
          components: {
            App: appMod.default,
            Document,
          },
          userland: userlandErrorPage,
        }),
      }

      const error500Mod = ${
        stringified500Path
          ? `{
        ...userland500Page,
        routeModule: new RouteModule({
          ...${JSON.stringify(getRouteModuleOptions('/500'))},
          components: {
            App: appMod.default,
            Document,
          },
          userland: userland500Page,
        }),
      }`
          : 'null'
      }`
    }

    ${
      incrementalCacheHandlerPath
        ? `import incrementalCacheHandler from ${JSON.stringify(
            incrementalCacheHandlerPath
          )}`
        : 'const incrementalCacheHandler = null'
    }

    const maybeJSONParse = (str) => str ? JSON.parse(str) : undefined

    const buildManifest = self.__BUILD_MANIFEST
    const prerenderManifest = maybeJSONParse(self.__PRERENDER_MANIFEST)
    const reactLoadableManifest = maybeJSONParse(self.__REACT_LOADABLE_MANIFEST)
    const rscManifest = self.__RSC_MANIFEST?.[${JSON.stringify(page)}]
    const rscServerManifest = maybeJSONParse(self.__RSC_SERVER_MANIFEST)
    const subresourceIntegrityManifest = ${
      sriEnabled
        ? 'maybeJSONParse(self.__SUBRESOURCE_INTEGRITY_MANIFEST)'
        : 'undefined'
    }
    const nextFontManifest = maybeJSONParse(self.__NEXT_FONT_MANIFEST)

    const render = getRender({
      pagesType,
      dev: ${dev},
      page: ${JSON.stringify(page)},
      appMod,
      pageMod,
      errorMod,
      error500Mod,
      Document,
      buildManifest,
      isAppPath: ${!!isAppDir},
      prerenderManifest,
      renderToHTML,
      reactLoadableManifest,
      clientReferenceManifest: ${isServerComponent} ? rscManifest : null,
      serverActionsManifest: ${isServerComponent} ? rscServerManifest : null,
      serverActionsBodySizeLimit: ${isServerComponent} ? ${
      typeof serverActionsBodySizeLimit === 'undefined'
        ? 'undefined'
        : JSON.stringify(serverActionsBodySizeLimit)
    } : undefined,
      subresourceIntegrityManifest,
      config: ${stringifiedConfig},
      buildId: ${JSON.stringify(buildId)},
      nextFontManifest,
      incrementalCacheHandler,
    })

    export const ComponentMod = pageMod

    export default function(opts) {
      return adapter({
        ...opts,
        IncrementalCache,
        handler: render
      })
    }`

    return transformed
  }
export default edgeSSRLoader
