import type { AppRouteRouteDefinition } from '../../../../../server/future/route-definitions/app-route-route-definition'
import type { ExecutableRoute } from './helpers/executable-route'
import type { NextConfig } from '../../../../../server/config'
import type { RequestAsyncStorage } from '../../../../../client/components/request-async-storage'
import type { StaticGenerationAsyncStorage } from '../../../../../client/components/static-generation-async-storage'

import {
  type AppRouteUserlandModule,
  AppRouteRouteHandler,
} from '../../../../../server/future/route-handlers/app-route-route-handler'
import { RouteKind } from '../../../../../server/future/route-kind'

type RouteOptions = {
  userland: AppRouteUserlandModule
  pathname: string
  resolvedPagePath: string
  nextConfigOutput: NextConfig['output'] | undefined
  requestAsyncStorage: RequestAsyncStorage
  staticGenerationAsyncStorage: StaticGenerationAsyncStorage
  serverHooks: typeof import('../../../../../client/components/hooks-server-context')
  headerHooks: typeof import('../../../../../client/components/headers')
  staticGenerationBailout: typeof import('../../../../../client/components/static-generation-bailout').staticGenerationBailout
}

export class Route implements ExecutableRoute<AppRouteRouteHandler> {
  public readonly handler: AppRouteRouteHandler

  constructor({
    resolvedPagePath,
    pathname,
    userland,
    nextConfigOutput,
    requestAsyncStorage,
    staticGenerationAsyncStorage,
    serverHooks,
    headerHooks,
    staticGenerationBailout,
  }: RouteOptions) {
    const definition: AppRouteRouteDefinition = {
      kind: RouteKind.APP_ROUTE,
      pathname,
      // The following aren't needed for the matcher in production.
      page: '',
      bundlePath: '',
      filename: '',
    }

    this.handler = new AppRouteRouteHandler({
      definition,
      userland,
      resolvedPagePath,
      nextConfigOutput,
      requestAsyncStorage,
      staticGenerationAsyncStorage,
      serverHooks,
      headerHooks,
      staticGenerationBailout,
    })
  }
}
