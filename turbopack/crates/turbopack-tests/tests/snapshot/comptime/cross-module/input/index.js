import { IS_DEV, SOME_VALUE } from './other'

if (SOME_VALUE === 'x') {
  console.log('x')
} else {
  require('./dead-code')
}
console.log(SOME_VALUE)

// --------------------------------------------------------------------------

if (IS_DEV) {
  console.log('is_dev')
} else {
  require('./dead-code')
}
console.log(IS_DEV)
