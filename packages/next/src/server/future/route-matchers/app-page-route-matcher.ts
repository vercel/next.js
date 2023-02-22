import { RouteMatcher } from './route-matcher'
import { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'

export class AppPageRouteMatcher extends RouteMatcher<AppPageRouteDefinition> {
  public get identity(): string {
    return `${
      this.definition.pathname
    }?__nextParallelPaths=${this.definition.appPaths.join(',')}}`
  }
}
