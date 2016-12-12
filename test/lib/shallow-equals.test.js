/* global expect, describe, test */

'use strict'

import shallowEquals from '../../lib/shallow-equals'

describe('shallow-equals', () => {
  test('returns true if all key/value pairs match', () => {
    expect(shallowEquals({
      a: 1,
      b: 2,
      c: 99
    }, {
      a: 1,
      b: 2,
      c: 99
    })).toBeTruthy()
  })

  test('returns false if any key/value pair is different', () => {
    expect(shallowEquals({
      a: 1,
      b: 2,
      c: 99
    }, {
      a: 1,
      b: 2,
      c: 99,
      d: 33
    })).toBeFalsy()
  })

  test('returns false if nested objects are contained', () => {
    expect(shallowEquals({
      a: 1,
      b: 2,
      c: {}
    }, {
      a: 1,
      b: 2,
      c: {}
    })).toBeFalsy()
  })
})
