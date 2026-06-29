// This module is trivally side effect free, but has an import so we can only detect that late
import { bar } from './indirect_dep'

const sideEffect = () => {
  globalThis.depBundled = true
  return bar
}
export const unused = /*#__PURE__*/ sideEffect()

export const foo = 'unused re-export'
