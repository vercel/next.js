globalThis.__namespace_value_side_effects =
  (globalThis.__namespace_value_side_effects ?? 0) + 1

export const value = 'direct-value'
export const sibling = 'sibling-value'
export const unused = 'unused'
export let live = 'before'

export function method() {
  return this.sibling
}

export function setLive(value) {
  live = value
}

export const unusedInfo = __webpack_exports_info__.unused.used
