import type { AsyncLocalStorage } from 'async_hooks'
import { createAsyncLocalStorage } from './async-local-storage'

export interface ActionStore {
  readonly isAction?: boolean
  readonly isAppRoute?: boolean
}

export type ActionAsyncStorage = AsyncLocalStorage<ActionStore>

export const actionAsyncStorage: ActionAsyncStorage = createAsyncLocalStorage()
