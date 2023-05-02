import type webpack from 'webpack'
import type { PagesRouteModuleOptions } from '../../../server/future/route-modules/pages/module'
import type { RouteDefinition } from '../../../server/future/route-definitions/route-definition'
import type { ServerRuntime } from '../../../../types'

import { stringify } from 'querystring'
import { RouteKind } from '../../../server/future/route-kind'
import { PagesBundlePathNormalizer } from '../../../server/future/normalizers/built/pages/pages-bundle-path-normalizer'
import { AppBundlePathNormalizer } from '../../../server/future/normalizers/built/app/app-bundle-path-normalizer'
import { PagesRouteDefinition } from '../../../server/future/route-definitions/pages-route-definition'
import { NextConfigComplete } from '../../../server/config-shared'
import { getModuleBuildInfo } from './get-module-build-info'

type NextRouteModuleLoaderOptions = {
  definition: string
  runtime: ServerRuntime
  config: string
  buildId: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absolute404Path: string
  absolute500Path: string
  absoluteErrorPath: string
  preferredRegion: string | string[] | undefined
}

function getBundlePath(kind: RouteKind, page: string): string {
  switch (kind) {
    case RouteKind.PAGES:
      return new PagesBundlePathNormalizer().normalize(page)
    case RouteKind.APP_ROUTE:
      return new AppBundlePathNormalizer().normalize(page)
    default:
      throw new Error(`Invariant: Unsupported route kind: ${kind}`)
  }
}

export const getRouteModuleLoader = ({
  pages,
  config,
  definition,
  ...options
}: {
  config: NextConfigComplete
  definition: Omit<RouteDefinition, 'bundlePath'>
  buildId: string
  runtime: ServerRuntime
  pages: { [page: string]: string }
  preferredRegion: string | string[] | undefined
}) => {
  const params: NextRouteModuleLoaderOptions = {
    ...options,
    config: Buffer.from(JSON.stringify(config)).toString('base64'),
    definition: Buffer.from(
      JSON.stringify({
        ...definition,
        bundlePath: getBundlePath(definition.kind, definition.page),
      })
    ).toString('base64'),
    // These are the path references to the internal components that may be
    // overridden by userland components.
    absoluteAppPath: pages['/_app'],
    absoluteDocumentPath: pages['/_document'],
    absolute500Path: pages['/500'] || pages['/_error'],
    absolute404Path: pages['/404'] || pages['/_error'],
    absoluteErrorPath: pages['/_error'],
    preferredRegion: options.preferredRegion,
  }

  return {
    import: `next-route-module-loader?${stringify(params)}!`,
  }
}

/**
 * This provides a  mapping of the route kind to the module name that will be
 * imported. This is used to dynamically import the correct module for the
 * route kind.
 */
function getRouteModule(kind: RouteKind): string {
  switch (kind) {
    case RouteKind.PAGES:
      return 'pages'
    case RouteKind.APP_ROUTE:
      return 'app-route'
    default:
      throw new Error(`Invariant: Unsupported route kind: ${kind}`)
  }
}

const loader: webpack.LoaderDefinitionFunction<NextRouteModuleLoaderOptions> =
  function () {
    const {
      config: configBase64,
      definition: definitionBase64,
      buildId,
      runtime,
      absoluteAppPath,
      absoluteDocumentPath,
      absolute500Path,
      absolute404Path,
      absoluteErrorPath,
      preferredRegion,
    } = this.getOptions()

    const config: NextConfigComplete = JSON.parse(
      Buffer.from(configBase64, 'base64').toString('utf-8')
    )
    const definition: PagesRouteDefinition = JSON.parse(
      Buffer.from(definitionBase64, 'base64').toString('utf-8')
    )

    const buildInfo = getModuleBuildInfo(this._module as any)
    buildInfo.route = {
      page: definition.page,
      // TODO-APP: This is not actually absolute.
      absolutePagePath: definition.filename,
      preferredRegion,
    }

    // This is providing the options defined by the route options type found at
    // ./routes/${kind}.ts. This is stringified here so that the literal for
    // `userland` can reference the variable for `userland` that's in scope for
    // the loader code.
    const options: Omit<PagesRouteModuleOptions, 'components' | 'userland'> = {
      definition,
      renderOpts: {
        buildId,
        disableOptimizedLoading: false,
        runtime,
      },
      config,
    }

    const prepare =
      runtime === 'edge' || runtime === 'experimental-edge'
        ? (str: string) => {
            if (str.startsWith('next/dist/esm')) {
              return JSON.stringify(str)
            }

            return JSON.stringify(str.replace('next/dist', 'next/dist/esm'))
          }
        : JSON.stringify

    return `
      import RouteModule from ${prepare(
        `next/dist/server/future/route-modules/${getRouteModule(
          definition.kind
        )}/module`
      )}

      import * as userland from ${prepare(definition.filename)}

      import * as moduleApp from ${prepare(absoluteAppPath)}
      import * as moduleDocument from ${prepare(absoluteDocumentPath)}
      import * as moduleInternalServerError from ${prepare(absolute500Path)}
      import * as moduleNotFound from ${prepare(absolute404Path)}
      import * as moduleError from ${prepare(absoluteErrorPath)}

      const options = ${JSON.stringify(options)}
      const routeModule = new RouteModule({
        ...options,
        components: {
          App: moduleApp.default,
          Document: moduleDocument.default,
          InternalServerError: moduleInternalServerError,
          NotFound: moduleNotFound,
          Error: moduleError,
        },
        userland,
      })

      export { routeModule }
    `
  }

export default loader
