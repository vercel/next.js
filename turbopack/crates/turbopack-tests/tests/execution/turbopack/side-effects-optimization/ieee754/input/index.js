/* These tests test that Turbopack's analyzer correctly 
   handles NaN === NaN and 0 === -0. These are handled 
   differently by Rust compared to JavaScript, see: 
   https://github.com/rust-lang/rust/issues/1084.

   Turbopack's analyzer should line up with JavaScript.
*/

it('NaN === NaN is not folded to truthy', () => {
  let mod
  if (NaN === NaN) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('else')
})

it('NaN !== NaN is not folded to falsy', () => {
  let mod
  if (NaN !== NaN) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('then')
})

it('NaN == NaN is not folded to truthy', () => {
  let mod
  if (NaN == NaN) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('else')
})

it('NaN != NaN is not folded to falsy', () => {
  let mod
  if (NaN != NaN) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('then')
})

it('0 === -0 is not folded to falsy', () => {
  let mod
  if (0 === -0) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('then')
})

it('0 !== -0 is not folded to truthy', () => {
  let mod
  if (0 !== -0) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('else')
})

it('0 == -0 is not folded to falsy', () => {
  let mod
  if (0 == -0) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('then')
})

it('0 != -0 is not folded to truthy', () => {
  let mod
  if (0 != -0) {
    mod = require('./then')
  } else {
    mod = require('./else')
  }
  expect(mod.value).toBe('else')
})
