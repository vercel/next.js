import test from 'ava'
import shallowEquals from '../../lib/shallow-equals'

test('returns true if all key/value pairs match', t => {
  t.true(shallowEquals({
    a: 1,
    b: 2,
    c: 99
  }, {
    a: 1,
    b: 2,
    c: 99
  }))
})

test('returns false if any key/value pair is different', t => {
  t.false(shallowEquals({
    a: 1,
    b: 2,
    c: 99
  }, {
    a: 1,
    b: 2,
    c: 99,
    d: 33
  }))
})

test('returns false if nested objects are contained', t => {
  t.false(shallowEquals({
    a: 1,
    b: 2,
    c: {}
  }, {
    a: 1,
    b: 2,
    c: {}
  }))
})
