import type { AsyncLocalStorage } from 'async_hooks'

const sharedAsyncLocalStorageNotAvailableError = new Error(
  'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
)

class FakeAsyncLocalStorage<Store extends {}>
  implements AsyncLocalStorage<Store>
{
  disable(): void {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  getStore(): Store | undefined {
    // This fake implementation of AsyncLocalStorage always returns `undefined`.
    return undefined
  }

  run<R>(): R {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  exit<R>(): R {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  enterWith(): void {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  static bind<T>(fn: T): T {
    return fn
  }
}

const maybeGlobalAsyncLocalStorage =
  typeof globalThis !== 'undefined' && (globalThis as any).AsyncLocalStorage

export function createAsyncLocalStorage<
  Store extends {},
>(): AsyncLocalStorage<Store> {
  if (maybeGlobalAsyncLocalStorage) {
    return new maybeGlobalAsyncLocalStorage()
  }
  return new FakeAsyncLocalStorage()
}

export function bindSnapshot<T>(fn: T): T {
  if (maybeGlobalAsyncLocalStorage) {
    return maybeGlobalAsyncLocalStorage.bind(fn)
  }
  return FakeAsyncLocalStorage.bind(fn)
}

export function createSnapshot(): <R, TArgs extends any[]>(
  fn: (...args: TArgs) => R,
  ...args: TArgs
) => R {
  if (maybeGlobalAsyncLocalStorage) {
    return maybeGlobalAsyncLocalStorage.snapshot()
  }
  return function (fn: any, ...args: any[]) {
    return fn(...args)
  }
}
