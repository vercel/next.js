import { C } from './C'
import { syncFn } from './syncFn'

export { helper } from './helper'

export function B(n: number) {
  if (n > 0) {
    C(n - 1)
    syncFn()
  }
}
