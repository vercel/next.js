import type { InternalRootRouteDefinition } from '../internal-route-definition'

import {
  isInstrumentationHookFilename,
  isMiddlewareFilename,
} from '../../../../build/utils'
import { RouteDefinitionBuilder } from './route-definition-builder'
import { RouteKind } from '../../route-kind'

type InternalHookRouteDefinitionBuilderInput = Pick<
  InternalRootRouteDefinition,
  'page' | 'filename'
>

export class InternalHookRouteDefinitionBuilder extends RouteDefinitionBuilder<
  InternalRootRouteDefinition,
  InternalHookRouteDefinitionBuilderInput
> {
  protected readonly definitions = new Array<InternalRootRouteDefinition>()

  public add({
    page,
    filename,
  }: InternalHookRouteDefinitionBuilderInput): void {
    if (!isMiddlewareFilename(page) && !isInstrumentationHookFilename(page)) {
      throw new Error(
        `Invariant: filename is not an internal hook route: ${filename}`
      )
    }

    // Remove the leading `/src` from the page.
    if (isInstrumentationHookFilename(page) && page.startsWith('/src')) {
      page = page.slice(4)
    }

    this.definitions.push({
      kind: RouteKind.INTERNAL_ROOT,
      bundlePath: page,
      filename,
      page,
      pathname: page,
    })
  }
}
