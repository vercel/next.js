import { SOME_VALUE, BARREL_VALUE, foo } from './library'

if (SOME_VALUE === 'x') {
  console.log('x')
} else {
  require('./dead-code')
}
console.log(SOME_VALUE)

console.log(foo())

if (BARREL_VALUE === 'barrel') {
  console.log('x')
} else {
  require('./dead-code')
}
console.log(BARREL_VALUE)
