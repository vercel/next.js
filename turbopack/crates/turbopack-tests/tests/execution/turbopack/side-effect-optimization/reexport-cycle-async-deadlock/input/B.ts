import { C } from './C'
import { asyncFn } from './asyncFn'

export { helper } from './helper'

export function B(n: number) {
  if (n > 0) {
    C(n - 1)
    asyncFn()
  }
}
