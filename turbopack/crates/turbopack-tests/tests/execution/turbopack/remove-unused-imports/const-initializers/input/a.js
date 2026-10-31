import { unused } from './library/unused.js'
import { used } from './library/used.js'
import { effect, iterable } from './library/effects.js'
import { loopValue } from './library/loop.js'

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
var unusedVar = unused
var unusedVar = () => unused()

export const redeclarationEffects = []
var unusedRedeclared = 0
{
  // This shares the top-level binding, but its initializer is not pure.
  var unusedRedeclared = redeclarationEffects.push('nested var initializer')
}

{
  effect('before nested redeclaration')
  var unusedReverseRedeclared = redeclarationEffects.push(
    'nested var before declaration'
  )
}
var unusedReverseRedeclared = 0

// Module-local writes are pure for module inference, but must not disappear just
// because the result of the assignment is unused.
export const config = {}
const unusedMutationResult = (config.value = 'kept')
const unusedRequireResult = require('./required.js')

for (const ignored of [1, 2]) {
  effect('iteration')
}

for (const unusedLoopAlias = unused; false; ) {}
for (const unusedLoopResult = effect(loopValue); false; ) {}

function identity(value) {
  return value
}
