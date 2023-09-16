import type { LoadComponentsReturnType } from '../../load-components'
import type { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import type { PagesRouteDefinition } from '../route-definitions/pages-route-definition'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { RouteMatch } from '../route-matches/route-match'
import type { RouteManager } from './route-manager'
import type { InternalPagesRouteDefinition } from '../route-definitions/internal-route-definition'
import type { RouteComponentsLoader } from '../route-components-loader/route-components-loader'
import type { RouteMatcher } from '../route-matchers/route-matcher'

import {
  createRouteDefinitionFilter,
  type RouteDefinitionFilterSpec,
} from '../route-definitions/providers/helpers/route-definition-filter'
import { RouteKind } from '../route-kind'
import { BaseRouteMatcher } from '../route-matchers/base-route-matcher'

export type WebRouteManagerOptions = {
  page: string
  pathname: string
  pagesType: 'app' | 'pages' | 'root'
  componentsLoader: RouteComponentsLoader
  error500Mod?: any
  errorMod?: any
}

type SupportedRouteDefinitions =
  | AppPageRouteDefinition
  | PagesRouteDefinition
  | InternalPagesRouteDefinition

export class WebRouteManager implements RouteManager {
  private readonly matcher: RouteMatcher
  private readonly definition: SupportedRouteDefinitions
  private readonly definitions = new Array<SupportedRouteDefinitions>()

  constructor(private readonly options: WebRouteManagerOptions) {
    if (options.pagesType === 'pages') {
      this.definition = {
        kind: RouteKind.PAGES,
        page: options.page,
        pathname: options.pathname,
        // The following properties are not used by the WebRouteManager.
        filename: '',
        bundlePath: '',
      }
    } else if (options.pagesType === 'app') {
      this.definition = {
        kind: RouteKind.APP_PAGE,
        page: options.page,
        pathname: options.pathname,
        // The following properties are not used by the WebRouteManager.
        filename: '',
        bundlePath: '',
        appPaths: [],
      }
    } else {
      // TODO: (wyattjoh) maybe this isn't required? What do root pages even do?
      throw new Error(`Unsupported pages type: ${options.pagesType}`)
    }

    this.matcher = new BaseRouteMatcher(this.definition)
    this.definitions.push(this.definition)

    if (options.error500Mod) {
      this.definitions.push({
        kind: RouteKind.INTERNAL_PAGES,
        page: '/500',
        pathname: '/500',
        // The following properties are not used by the WebRouteManager.
        filename: '',
        bundlePath: '',
        builtIn: false,
      })
    }

    if (options.errorMod) {
      this.definitions.push({
        kind: RouteKind.INTERNAL_PAGES,
        page: '/_error',
        pathname: '/_error',
        // The following properties are not used by the WebRouteManager.
        filename: '',
        bundlePath: '',
        builtIn: false,
      })
    }
  }

  public hasDefinition<D extends RouteDefinition<RouteKind>>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): boolean {
    const definition = this.findDefinition(...specs)

    // If the definition is null, then it doesn't exist.
    return definition !== null
  }

  public findDefinition<D extends RouteDefinition<RouteKind>>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): D | null {
    for (const spec of specs) {
      const filter = createRouteDefinitionFilter(spec)

      // Loop through all the definitions and find the first one that matches
      // the filter.
      const definition = this.definitions.find((d) => filter(d as D))
      if (definition) return definition as D
    }

    return null
  }

  public loadComponents(
    definition: RouteDefinition<RouteKind>
  ): Promise<LoadComponentsReturnType | null> {
    return this.options.componentsLoader.load(definition)
  }

  /**
   * Return the single match for the given pathname.
   *
   * @param pathname The pathname to match.
   * @returns The single match.
   */
  public match(
    pathname: string
  ): RouteMatch<RouteDefinition<RouteKind>> | null {
    const match = this.matcher.match({ pathname })
    if (!match) return null

    return match
  }

  /**
   * Yield the single match for the given pathname.
   *
   * @param pathname The pathname to match.
   * @returns An async generator that yields the single match.
   */
  public async *matchAll(
    pathname: string
  ): AsyncGenerator<RouteMatch<RouteDefinition<RouteKind>>, void, void> {
    const match = this.matcher.match({ pathname })
    if (!match) return

    yield match
  }

  // The following are not used by the WebRouteManager.
  public invalidate(): void {}
  public load(): void {}
  public forceReload(): void {}
}
