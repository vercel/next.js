import type { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'

import { DefaultRouteMatcher } from './default-route-matcher'

export class AppPageRouteMatcher extends DefaultRouteMatcher<AppPageRouteDefinition> {
  public get identity(): string {
    return `${this.definition.pathname}?__nextPage=${encodeURIComponent(
      this.definition.page
    )}`
  }
}
