import type { AppRouteRouteDefinition } from '../../../../../server/future/route-definitions/app-route-route-definition'
import type { ExecutableRoute } from './helpers/executable-route'
import type { NextConfig } from '../../../../../server/config'

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
}

export class Route implements ExecutableRoute<AppRouteRouteHandler> {
  public readonly handler: AppRouteRouteHandler

  constructor({
    resolvedPagePath,
    pathname,
    userland,
    nextConfigOutput,
  }: RouteOptions) {
    const definition: AppRouteRouteDefinition = {
      kind: RouteKind.APP_ROUTE,
      pathname,
      // The following aren't needed for the matcher in production.
      page: '',
      bundlePath: '',
      filename: '',
    }

    this.handler = new AppRouteRouteHandler(
      definition,
      userland,
      resolvedPagePath,
      nextConfigOutput
    )
  }
}
