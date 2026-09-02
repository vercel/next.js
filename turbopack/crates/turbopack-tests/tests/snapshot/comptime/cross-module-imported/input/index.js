import {
  SOME_VALUE,
  IMPORTED_EXPORTED,
  REEXPORTED,
  USING_IMPORTED_EXPORTED,
} from './other'

if (SOME_VALUE === 'x') {
  console.log('x')
} else {
  require('./dead-code')
}
console.log(SOME_VALUE)

// --------------------------------------------------------------------------

// These aren't considered to be constants
console.log(IMPORTED_EXPORTED)
console.log(REEXPORTED)
console.log(USING_IMPORTED_EXPORTED)
