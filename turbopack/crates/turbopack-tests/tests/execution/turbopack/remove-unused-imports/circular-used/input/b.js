import { cycliclyUsedA } from './a'

const sideEffect = () => {
  globalThis.bBundled = true
  return 'b'
}

export const b = /*#__PURE__*/ sideEffect()

export function cycliclyUsedB() {
  return 'b-' + cycliclyUsedA()
}
