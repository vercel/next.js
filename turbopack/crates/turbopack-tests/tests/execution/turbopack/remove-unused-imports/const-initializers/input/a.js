import { unused } from './library/unused.js'
import { used } from './library/used.js'
import { effect, iterable } from './library/effects.js'

export const unusedAlias = unused
export const unusedArrow = () => unused()
export const usedArrow = () => used()
export const usedObject = { callback: used }

const unusedEffectResult = effect('initializer')
const unusedPureCall = /*#__PURE__*/ identity(effect('argument'))
const { unusedProperty } = {
  get unusedProperty() {
    effect('destructuring')
    return 'value'
  },
}
const unusedSpreadResult = /*#__PURE__*/ identity(...iterable)
const unusedCallback = /*#__PURE__*/ identity(() => effect('unused callback'))

// An effectful declarator must not hide pure declarators in the same statement,
// or pure declarations that follow it.
const unusedBeforeEffect = unused,
  mixedEffectResult = effect('mixed declaration'),
  unusedAfterEffect = () => unused()
let unusedLet = unused
var unusedVar = () => unused()

for (const ignored of [1, 2]) {
  effect('iteration')
}

for (const unusedLoopAlias = unused; false; ) {}

function identity(value) {
  return value
}
