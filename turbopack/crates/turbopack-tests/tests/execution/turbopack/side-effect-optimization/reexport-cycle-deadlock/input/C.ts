import { A } from './A'

export { helper } from './helper'

export function C(n: number) {
  if (n > 0) {
    A(n - 1)
  }
}
