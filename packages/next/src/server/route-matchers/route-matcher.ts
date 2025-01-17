import type { RouteMatch } from '../route-matches/route-match'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { Params } from '../request/params'

import { isDynamicRoute } from '../../shared/lib/router/utils'
import {
  getRouteMatcher,
  type RouteMatchFn,
} from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'

type RouteMatchResult = {
  params?: Params
}

export class RouteMatcher<D extends RouteDefinition = RouteDefinition> {
  private readonly dynamic?: RouteMatchFn

  /**
   * When set, this is an array of all the other matchers that are duplicates of
   * this one. This is used by the managers to warn the users about possible
   * duplicate matches on routes.
   */
  public duplicated?: Array<RouteMatcher>

  constructor(public readonly definition: D) {
    if (isDynamicRoute(definition.pathname)) {
      this.dynamic = getRouteMatcher(getRouteRegex(definition.pathname))
    }
  }

  /**
   * Identity returns the identity part of the matcher. This is used to compare
   * a unique matcher to another. This is also used when sorting dynamic routes,
   * so it must contain the pathname part.
   */
  public get identity(): string {
    return this.definition.pathname
  }

  public get isDynamic() {
    return this.dynamic !== undefined
  }

  public match(pathname: string): RouteMatch<D> | null {
    const result = this.test(pathname)
    if (!result) return null

    return { definition: this.definition, params: result.params }
  }

  public test(pathname: string): RouteMatchResult | null {
    if (this.dynamic) {
      const params = this.dynamic(pathname)
      if (!params) return null

      return { params }
    }

    if (pathname === this.definition.pathname) {
      return {}
    }

    return null
  }
}
