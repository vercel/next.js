import { cycliclyUsedB } from './b'

const sideEffect = () => {
  globalThis.aBundled = true
  return 'a'
}

export const a = /*#__PURE__*/ sideEffect()

export function cycliclyUsedA() {
  return 'a-' + cycliclyUsedB()
}
