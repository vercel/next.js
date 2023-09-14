import type { InternalRootRouteDefinition } from '../internal-route-definition'

import { RouteKind } from '../../route-kind'
import { RouteDefinitionBuilder } from './route-definition-builder'

type InternalRootRouteDefinitionBuilderInput = Pick<
  InternalRootRouteDefinition,
  'page' | 'filename'
>

export class InternalRootRouteDefinitionBuilder extends RouteDefinitionBuilder<
  InternalRootRouteDefinition,
  InternalRootRouteDefinitionBuilderInput
> {
  protected readonly definitions = new Array<InternalRootRouteDefinition>()

  public add({
    page,
    filename,
  }: InternalRootRouteDefinitionBuilderInput): void {
    // Trim the leading `/` from the bundle path.
    const bundlePath = page.slice(1)

    this.definitions.push({
      kind: RouteKind.INTERNAL_ROOT,
      bundlePath,
      filename,
      page,
      pathname: page,
    })
  }
}
