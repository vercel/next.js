// The only export of this module. It is emitted under the fixed single-export key rather than a
// hashed one, so that every single-export module in the graph produces the same `.f` byte sequence
// and gzip can share it. Visible in the committed output below.
export function aLongFunctionNameNobodyWantsInTheBundle() {
  return 'lone'
}
