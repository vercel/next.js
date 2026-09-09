import { lower } from './other' with { turbopackConstants: 'true' }

if (lower === 'lowercase') {
  console.log('x')
} else {
  require('./dead-code')
}
console.log(lower)

import { UPPER } from './other' with { turbopackConstants: 'false' }
if (UPPER === 'UPPER') {
  console.log('x')
} else {
  require('./correct-not-inlined')
}
console.log(UPPER)

import { nonConstant } from './non-constant' with { turbopackConstants: 'true' }
if (nonConstant.v === 1234) {
  console.log('x')
} else {
  require('./correct-not-inlined')
}
console.log(nonConstant)
