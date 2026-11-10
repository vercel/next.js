import { C } from './C'
import { asyncImportFn } from './asyncImportFn'

export function B(n: number) {
  if (n > 0) {
    C(n - 1)
    asyncImportFn()
  }
}
