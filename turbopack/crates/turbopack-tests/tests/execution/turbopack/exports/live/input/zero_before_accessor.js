// The bindings array is emitted in export name order, so `zero` lands directly before the
// accessor for `zeroLive`. The runtime has to read the `0` here as the value of `zero`, not as the
// tag that starts `zeroLive`'s accessor.
export const zero = 0
export let zeroLive = 'zeroLive'

export function setZeroLive(v) {
  zeroLive = v
}

// Test-only. `index.js` inspects this module's namespace descriptors directly, and the keys there
// may be mangled; `__webpack_exports_info__` reports the emitted key for each original name.
export const exportsInfo = __webpack_exports_info__
