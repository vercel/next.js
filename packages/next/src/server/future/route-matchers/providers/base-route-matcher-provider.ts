import type { RouteDefinitionProvider } from '../../route-definitions/providers/route-definition-provider'
import type { RouteDefinition } from '../../route-definitions/route-definition'
import type { RouteMatcherProvider } from './route-matcher-provider'
import type { RouteMatcher } from '../route-matcher'

import { MemoizedTransformerProvider } from '../../helpers/memoized-transformer'

export abstract class BaseRouteMatcherProvider<
    D extends RouteDefinition = RouteDefinition,
    M extends RouteMatcher<D> = RouteMatcher<D>
  >
  extends MemoizedTransformerProvider<ReadonlyArray<D>, ReadonlyArray<M>>
  implements RouteMatcherProvider<D, M>
{
  constructor(private readonly definitions: RouteDefinitionProvider<D>) {
    super()
  }

  protected load() {
    return this.definitions.provide()
  }

  protected compare(left: ReadonlyArray<D>, right: ReadonlyArray<D>): boolean {
    if (left.length !== right.length) return false

    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false
    }

    return true
  }

  public async provide(): Promise<ReadonlyArray<M>> {
    const matchers = await super.provide()
    if (!matchers) return []

    return matchers
  }
}
