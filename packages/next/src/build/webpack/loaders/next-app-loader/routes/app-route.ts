import type { AppRouteRouteDefinition } from '../../../../../server/future/route-definitions/app-route-route-definition'
import type {
  ExecutableRoute,
  ExecutableRouteOptions,
} from './helpers/executable-route'
import type { NextConfig } from '../../../../../server/config'

import {
  type AppRouteUserlandModule,
  AppRouteRouteHandler,
} from '../../../../../server/future/route-handlers/app-route-route-handler'
import { RouteKind } from '../../../../../server/future/route-kind'

interface RouteOptions
  extends ExecutableRouteOptions<
    AppRouteRouteDefinition,
    AppRouteRouteHandler,
    AppRouteUserlandModule
  > {
  readonly pathname: string
  readonly resolvedPagePath: string
  readonly nextConfigOutput: NextConfig['output'] | undefined
}

export class Route
  implements ExecutableRoute<AppRouteRouteDefinition, AppRouteRouteHandler>
{
  public readonly handler: AppRouteRouteHandler
  public readonly definition: AppRouteRouteDefinition

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
    this.definition = {
      kind: RouteKind.APP_ROUTE,
      pathname,
      // The following aren't needed for the matcher in production.
      page: '',
      bundlePath: '',
      filename: '',
    }

    this.handler = new AppRouteRouteHandler({
      definition: this.definition,
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
