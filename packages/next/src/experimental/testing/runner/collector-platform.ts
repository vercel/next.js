import { AsyncLocalStorage } from 'node:async_hooks'
export { formatWithOptions, inspect } from 'node:util'

export function createDeclarationStorage<T>() {
  return new AsyncLocalStorage<T>()
}
