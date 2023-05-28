import type {
  GetServerSideProps,
  GetStaticPaths,
  GetStaticProps,
  NextComponentType,
  PageConfig,
} from '../../../../../types'
import type { PagesRouteDefinition } from '../../route-definitions/pages-route-definition'

import { RouteModule, type RouteModuleOptions } from '../route-module'

/**
 * The userland module for a page. This is the module that is exported from the
 * page file that contains the page component, page config, and any page data
 * fetching functions.
 */
export type PagesUserlandModule = {
  /**
   * The exported page component.
   */
  readonly default: NextComponentType

  /**
   * The exported page config.
   */
  readonly config?: PageConfig

  /**
   * The exported `getStaticProps` function.
   */
  readonly getStaticProps?: GetStaticProps

  /**
   * The exported `getStaticPaths` function.
   */
  readonly getStaticPaths?: GetStaticPaths

  /**
   * The exported `getServerSideProps` function.
   */
  readonly getServerSideProps?: GetServerSideProps
}

export type PagesRouteModuleOptions = RouteModuleOptions<
  PagesRouteDefinition,
  PagesUserlandModule
>

class PagesRouteModule extends RouteModule<
  PagesRouteDefinition,
  PagesUserlandModule
> {
  public setup(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }
}

export default PagesRouteModule
