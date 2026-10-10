import { SOME_VALUE, NO_CONSTANT, MISSING } from './other'

if (SOME_VALUE === 'x') {
  console.log('x')
} else {
  require('./dead-code')
}

// --------------------------------------------------------------------------

if (NO_CONSTANT) {
  console.log('NO_CONSTANT 1')
} else {
  console.log('NO_CONSTANT 2')
}
console.log(NO_CONSTANT)

// --------------------------------------------------------------------------

if (MISSING) {
  console.log('MISSING 1')
} else {
  console.log('MISSING 2')
}
console.log(MISSING)

// --------------------------------------------------------------------------

import { LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, LONG_REGEX } from './other'

console.log(LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, LONG_REGEX)
