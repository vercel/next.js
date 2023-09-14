import type { Provider } from '../../helpers/provider'
import type { RouteDefinition } from '../../route-definitions/route-definition'
import type { RouteMatcher } from '../route-matcher'

export interface RouteMatcherProvider<
  D extends RouteDefinition = RouteDefinition,
  M extends RouteMatcher<D> = RouteMatcher<D>
> extends Provider<ReadonlyArray<M>> {}
