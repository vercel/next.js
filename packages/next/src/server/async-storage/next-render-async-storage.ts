import { AsyncLocalStorage } from 'async_hooks'
import { RouteKind } from '../future/route-kind'

export interface NextRenderStore {
  readonly routeKind: RouteKind
  readonly experimentalReact?: boolean
}

export type NextRenderAsyncStorage = AsyncLocalStorage<NextRenderStore>
export const nextRenderAsyncStorage: NextRenderAsyncStorage =
  new AsyncLocalStorage()
