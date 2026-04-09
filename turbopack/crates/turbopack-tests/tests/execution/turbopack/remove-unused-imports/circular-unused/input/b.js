import { a } from './a'

const sideEffect = () => {
  globalThis.bBundled = true
  return a
}

export const b = /*#__PURE__*/ sideEffect()

export function unusedB() {
  return 'b-' + a
}
