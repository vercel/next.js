/* global describe it */
'use strict'

const assert = require('assert')
const app = require('../../../src/app')

describe('posts service', function () {
  it('registered the posts service', () => {
    assert.ok(app.service('posts'))
  })
})
