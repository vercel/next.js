import { B } from './B'

// This re-export is what forces the facade/locals split for this module
// (`EcmascriptExports::split_locals_and_reexports` returns true as soon as a
// module has any `ImportedBinding`/star re-export). No other option is needed.
export { helper } from './helper'

export function A(n: number) {
  if (n > 0) {
    B(n - 1)
  }
}
