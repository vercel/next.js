'use strict'

const strictA = require('./strict-a')
const strictB = require('./strict-b').default
const sloppy = require('./non-strict')

import('./below-threshold').then(({ value }) => {
  console.log('below threshold', value)
})

console.log('this is CJS', strictA, strictB, sloppy)
module.exports = strictA + strictB + sloppy
