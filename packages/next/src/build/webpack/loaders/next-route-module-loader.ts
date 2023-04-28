import type webpack from 'webpack'
import type { PagesRouteModuleOptions } from '../../../server/future/route-modules/pages/module'
import type { ServerRuntime } from '../../../../types'

import { stringify } from 'querystring'

type NextRouteModuleLoaderOptions = {
  page: string
  kind: 'app-route' | 'pages'
  runtime: ServerRuntime
  pathname: string
  filename: string
  dev: 'true' | 'false'
  config: string
  buildId: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absolute404Path: string
  absolute500Path: string
  absoluteErrorPath: string
}

export const getNextRouteModuleEntry = ({
  pages,
  dev,
  config,
  ...options
}: {
  dev: boolean
  config: string
  buildId: string
  page: string
  runtime: ServerRuntime
  pages: { [page: string]: string }
  kind: 'app-route' | 'pages'
  pathname: string
  filename: string
}) => {
  const params: NextRouteModuleLoaderOptions = {
    ...options,
    config: Buffer.from(config).toString('base64'),
    dev: dev ? 'true' : 'false',

    // These are the path references to the internal components that may be
    // overridden by userland components.
    absoluteAppPath: pages['/_app'],
    absoluteDocumentPath: pages['/_document'],
    absolute500Path: pages['/500'] || pages['/_error'],
    absolute404Path: pages['/404'] || pages['/_error'],
    absoluteErrorPath: pages['/_error'],
  }

  return {
    import: `next-route-module-loader?${stringify(params)}!`,
  }
}

const loader: webpack.LoaderDefinitionFunction<NextRouteModuleLoaderOptions> =
  function () {
    const {
      page,
      pathname,
      dev,
      config: configBase64,
      buildId,
      kind,
      runtime,
      filename,
      absoluteAppPath,
      absoluteDocumentPath,
      absolute500Path,
      absolute404Path,
      absoluteErrorPath,
    } = this.getOptions()

    const config = Buffer.from(configBase64, 'base64').toString('utf8')

    // This is providing the options defined by the route options type found at
    // ./routes/${kind}.ts. This is stringified here so that the literal for
    // `userland` can reference the variable for `userland` that's in scope for
    // the loader code.
    const options: Omit<PagesRouteModuleOptions, 'components' | 'userland'> = {
      page,
      pathname,
      renderOpts: {
        dev: dev === 'true',
        buildId,
        disableOptimizedLoading: false,
        runtime,
      },
      config: JSON.parse(config),
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
        `next/dist/server/future/route-modules/${kind}/module`
      )}

      import * as userland from ${prepare(filename)}

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
