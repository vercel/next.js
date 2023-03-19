import { RouteKind } from '../route-kind'

export interface RouteDefinition<K extends RouteKind = RouteKind> {
  readonly kind: K
  readonly bundlePath: string
  readonly filename: string
  readonly page: string
  readonly pathname: string
}
