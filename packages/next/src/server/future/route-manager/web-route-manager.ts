import type { LoadComponentsReturnType } from '../../load-components'
import type { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import type { PagesRouteDefinition } from '../route-definitions/pages-route-definition'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { RouteMatch } from '../route-matches/route-match'
import type { RouteManager } from './route-manager'
import type { InternalPagesRouteDefinition } from '../route-definitions/internal-route-definition'
import type { RouteComponentsLoader } from '../route-components-loader/route-components-loader'

import { RouteKind } from '../route-kind'

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

  public findDefinition<D extends RouteDefinition<RouteKind>>(
    ...specs: Partial<D>[]
  ): Promise<D | null> {
    for (const spec of specs) {
      for (const definition of this.definitions) {
        for (const [key, value] of Object.entries(spec)) {
          if (definition[key as keyof SupportedRouteDefinitions] !== value) {
            continue
          }
        }

        return Promise.resolve(definition as D)
      }
    }

    return Promise.resolve(null)
  }

  public loadComponents(
    definition: RouteDefinition<RouteKind>
  ): Promise<LoadComponentsReturnType | null> {
    return this.options.componentsLoader.load(definition)
  }

  public async match(): Promise<RouteMatch<RouteDefinition<RouteKind>> | null> {
    return {
      definition: this.definition,
      // Params are actually provided via query params.
      params: undefined,
    }
  }

  public async *matchAll(): AsyncGenerator<
    RouteMatch<RouteDefinition<RouteKind>>,
    void,
    void
  > {
    yield {
      definition: this.definition,
      // Params are actually provided via query params.
      params: undefined,
    }
  }

  public invalidate(): void {
    // This is a no-op.
  }

  public load(): Promise<void> {
    // This is a no-op.
    return Promise.resolve()
  }

  public forceReload(): Promise<void> {
    // This is a no-op.
    return Promise.resolve()
  }
}
