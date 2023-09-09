import { RouteDefinition } from '../route-definitions/route-definition'

export type Subscription<D extends RouteDefinition = RouteDefinition> = (
  definitions: ReadonlyArray<D>
) => void

export interface RouteDefinitionProvider<
  D extends RouteDefinition = RouteDefinition
> {
  readonly kind: D['kind']

  toArray(): Promise<ReadonlyArray<D>>
  reload(): Promise<void>
  find(spec: Partial<D>): Promise<D | null>
  filter(spec: Partial<D>): Promise<ReadonlyArray<D>>
}
