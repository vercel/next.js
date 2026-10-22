import { pureExpensive } from './library/pure-expensive.js'
import { wrapper } from './runtime.js'

const pureHoistedInner = async function cached() {
  return pureExpensive()
}

export var pureHoistedWrapper = /*#__PURE__*/ wrapper(function cached() {
  return pureHoistedInner()
})

export function lightweight() {
  return 'lightweight'
}
