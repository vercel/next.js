import { AsyncLocalStorage } from 'async_hooks'
import { createAsyncLocalStorage } from '../../client/components/async-local-storage'
import { RouteKind } from '../future/route-kind'

export interface NextRenderStore {
  readonly routeKind: RouteKind
  readonly experimentalReact?: boolean
}

export type NextRenderAsyncStorage = AsyncLocalStorage<NextRenderStore>
export const nextRenderAsyncStorage: NextRenderAsyncStorage =
  createAsyncLocalStorage()
