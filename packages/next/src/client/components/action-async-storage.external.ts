import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;('TURBOPACK { turbopack-transition: next-shared }')
import { actionAsyncStorage } from './action-async-storage-instance'
export interface ActionStore {
  readonly isAction?: boolean
  readonly isAppRoute?: boolean
}

export type ActionAsyncStorage = AsyncLocalStorage<ActionStore>

export { actionAsyncStorage }
