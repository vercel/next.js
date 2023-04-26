import type { AsyncLocalStorage } from 'async_hooks'

export interface ActionStore {
  readonly isAction: boolean
}

export type ActionAsyncStorage = AsyncLocalStorage<ActionStore>

let createAsyncLocalStorage: () => ActionAsyncStorage
if (process.env.NEXT_RUNTIME === 'edge') {
  createAsyncLocalStorage = () => {
    let store: ActionStore | undefined
    return {
      disable() {
        throw new Error(
          'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
        )
      },
      getStore() {
        return store
      },
      async run<R>(s: ActionStore, fn: () => R): Promise<R> {
        store = s
        try {
          return await fn()
        } finally {
          store = undefined
        }
      },
      exit() {
        throw new Error(
          'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
        )
      },
      enterWith() {
        throw new Error(
          'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
        )
      },
    } as ActionAsyncStorage
  }
} else {
  createAsyncLocalStorage =
    require('./async-local-storage').createAsyncLocalStorage
}

export const actionAsyncStorage: ActionAsyncStorage = createAsyncLocalStorage()
