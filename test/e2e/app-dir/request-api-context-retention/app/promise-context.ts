import { createHook } from 'node:async_hooks'
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

const promiseContextSymbol = Symbol.for('next.test.promise-context')

createHook({
  init(_asyncId, type, _triggerAsyncId, resource) {
    if (type === 'PROMISE') {
      Object.defineProperty(resource, promiseContextSymbol, {
        value: {
          workStore: workAsyncStorage.getStore() !== undefined,
          workUnitStore: workUnitAsyncStorage.getStore() !== undefined,
        },
      })
    }
  },
}).enable()

type PromiseContext = {
  workStore: boolean
  workUnitStore: boolean
}

export function getPromiseContext(promise: Promise<unknown>): PromiseContext {
  const context = (
    promise as unknown as Record<symbol, PromiseContext | undefined>
  )[promiseContextSymbol]
  if (!context) {
    throw new Error('Promise was created before context tracking was enabled')
  }
  return context
}
