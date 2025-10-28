import type webpack from 'webpack'
import type { SizeLimit } from '../../../../types'
import type { PagesRouteModuleOptions } from '../../../../server/route-modules/pages/module'
import type { ProxyConfig } from '../../../analysis/get-page-static-info'

import { getModuleBuildInfo } from '../get-module-build-info'
import { WEBPACK_RESOURCE_QUERIES } from '../../../../lib/constants'
import { RouteKind } from '../../../../server/route-kind'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { loadEntrypoint } from '../../../load-entrypoint'
import type { PAGE_TYPES } from '../../../../lib/page-types'

export type EdgeSSRLoaderQuery = {
  absolute500Path: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absoluteErrorPath: string
  absolutePagePath: string
  dev: boolean
  isServerComponent: boolean
  page: string
  stringifiedConfig: string
  appDirLoader?: string
  pagesType: PAGE_TYPES
  sriEnabled: boolean
  cacheHandler?: string
  cacheHandlers?: string
  preferredRegion: string | string[] | undefined
  middlewareConfig: string
  serverActions?: {
    bodySizeLimit?: SizeLimit
    allowedOrigins?: string[]
  }
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
      bundlePath: '',
      filename: '',
    },
    // edge runtime doesn't read from distDir or projectDir
    distDir: '',
    relativeProjectDir: '',
  }

  return options
}

const edgeSSRLoader: webpack.LoaderDefinitionFunction<EdgeSSRLoaderQuery> =
  async function edgeSSRLoader(this) {
    const {
      page,
      absolutePagePath,
      absoluteAppPath,
      absoluteDocumentPath,
      absolute500Path,
      absoluteErrorPath,
      isServerComponent,
      stringifiedConfig: stringifiedConfigBase64,
      appDirLoader: appDirLoaderBase64,
      pagesType,
      cacheHandler,
      cacheHandlers: cacheHandlersStringified,
      preferredRegion,
      middlewareConfig: middlewareConfigBase64,
    } = this.getOptions()

    const cacheHandlers = JSON.parse(cacheHandlersStringified || '{}')

    if (!cacheHandlers.default) {
      cacheHandlers.default = require.resolve(
        '../../../../server/lib/cache-handlers/default.external'
      )
    }

    const middlewareConfig: ProxyConfig = JSON.parse(
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
      isServerComponent,
      page: page,
      isAppDir,
    }
    buildInfo.route = {
      page,
      absolutePagePath,
      preferredRegion,
      middlewareConfig,
    }

    const pagePath = this.utils.contextify(
      this.context || this.rootContext,
      absolutePagePath
    )
    const appPath = absoluteAppPath
      ? this.utils.contextify(
          this.context || this.rootContext,
          swapDistFolderWithEsmDistFolder(absoluteAppPath)
        )
      : ''
    const errorPath = absoluteErrorPath
      ? this.utils.contextify(
          this.context || this.rootContext,
          swapDistFolderWithEsmDistFolder(absoluteErrorPath)
        )
      : ''
    const documentPath = absoluteDocumentPath
      ? this.utils.contextify(
          this.context || this.rootContext,
          swapDistFolderWithEsmDistFolder(absoluteDocumentPath)
        )
      : ''
    const userland500Path = absolute500Path
      ? this.utils.contextify(
          this.context || this.rootContext,
          swapDistFolderWithEsmDistFolder(absolute500Path)
        )
      : null

    const stringifiedPagePath = JSON.stringify(pagePath)

    const pageModPath = `${appDirLoader}${stringifiedPagePath.substring(
      1,
      stringifiedPagePath.length - 1
    )}${isAppDir ? `?${WEBPACK_RESOURCE_QUERIES.edgeSSREntry}` : ''}`

    if (isAppDir) {
      return await loadEntrypoint(
        'edge-ssr-app',
        {
          VAR_USERLAND: pageModPath,
          VAR_PAGE: page,
        },
        {
          nextConfig: stringifiedConfig,
        },
        {
          incrementalCacheHandler: cacheHandler ?? null,
        }
      )
    } else {
      return await loadEntrypoint(
        'edge-ssr',
        {
          VAR_USERLAND: pageModPath,
          VAR_PAGE: page,
          VAR_MODULE_DOCUMENT: documentPath,
          VAR_MODULE_APP: appPath,
          VAR_MODULE_GLOBAL_ERROR: errorPath,
        },
        {
          nextConfig: stringifiedConfig,
          pageRouteModuleOptions: JSON.stringify(getRouteModuleOptions(page)),
          errorRouteModuleOptions: JSON.stringify(
            getRouteModuleOptions('/_error')
          ),
          user500RouteModuleOptions: JSON.stringify(
            getRouteModuleOptions('/500')
          ),
        },
        {
          userland500Page: userland500Path,
          incrementalCacheHandler: cacheHandler ?? null,
        }
      )
    }
  }
export default edgeSSRLoader
