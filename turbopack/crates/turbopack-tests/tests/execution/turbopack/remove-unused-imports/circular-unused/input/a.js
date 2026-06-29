import { b } from './b'

const sideEffect = () => {
  globalThis.aBundled = true
  return b
}

export const a = /*#__PURE__*/ sideEffect()

export function unusedA() {
  return 'a-' + b
}
