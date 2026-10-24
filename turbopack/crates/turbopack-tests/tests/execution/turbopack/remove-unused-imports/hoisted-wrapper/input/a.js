import { pureExpensive } from './library/pure-expensive.js'
import { cache, reactCache } from './runtime.js'

const pureHoistedInner = async function cached() {
  return pureExpensive()
}

export var pureHoistedWrapper = /*#__PURE__*/ reactCache(function cached() {
  return cache('default', 'unused-pure-wrapper', 0, pureHoistedInner, [])
})

export function lightweight() {
  return 'lightweight'
}
