import { AsyncLocalStorage } from 'async_hooks'

class FakeAsyncLocalStorage<Store extends {}>
  implements AsyncLocalStorage<Store>
{
  disable(): void {
    throw new Error(
      'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
    )
  }

  getStore(): Store | undefined {
    // This fake implementation of AsyncLocalStorage always returns `undefined`.
    return undefined
  }

  run<R>(): R {
    throw new Error(
      'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
    )
  }

  exit<R>(): R {
    throw new Error(
      'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
    )
  }

  enterWith(): void {
    throw new Error(
      'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
    )
  }
}

export function createAsyncLocalStorage<
  Store extends {}
>(): AsyncLocalStorage<Store> {
  if ((globalThis as any).AsyncLocalStorage) {
    return new (globalThis as any).AsyncLocalStorage()
  }

  return new FakeAsyncLocalStorage()
}
