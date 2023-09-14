import type { RouteMatch } from '../route-matches/route-match'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { PathnameMatcher } from './helpers/pathname-matcher'

import { RouteMatcher, type RouteMatcherOptions } from './route-matcher'
import { DynamicPathnameMatcher } from './helpers/dynamic-pathname-matcher'
import { createPathnameMatcher } from './helpers/create-pathname-matcher'

type DefaultMatcherMatchOptions = RouteMatcherOptions

export class BaseRouteMatcher<
  D extends RouteDefinition = RouteDefinition,
  M extends DefaultMatcherMatchOptions = DefaultMatcherMatchOptions
> extends RouteMatcher<D, M> {
  private readonly matcher: PathnameMatcher

  constructor(definition: D) {
    super(definition)
    this.matcher = createPathnameMatcher(definition.pathname)
  }

  public get identity(): string {
    return this.definition.page
  }

  public get isDynamic() {
    return this.matcher instanceof DynamicPathnameMatcher
  }

  public match({ pathname }: M): RouteMatch<D> | null {
    const result = this.matcher.match(pathname)
    if (!result) return null

    return { definition: this.definition, params: result.params }
  }
}
