import { NEXT_URL } from '../client/components/app-router-headers'
import type { Rewrite } from './load-custom-routes'
import type { DeepReadonly } from '../shared/lib/deep-readonly'

export function isInterceptionRouteRewrite(route: DeepReadonly<Rewrite>) {
  // When we generate interception rewrites in the above implementation, we always do so with only a single `has` condition.
  return route.has?.[0]?.key === NEXT_URL
}
