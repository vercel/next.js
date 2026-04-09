import { B } from './B'

export function A(n: number) {
  if (n > 0) {
    B(n - 1)
  }
}
