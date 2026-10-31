'use strict'

const strictA = require('./strict-a')
const strictB = require('./strict-b').default
const sloppy = require('./non-strict')

import('./below-threshold').then(({ value }) => {
  console.log('below threshold', value)
})
import('./all-strict').then(({ value }) => {
  console.log('all strict', value)
})

console.log('this is CJS', strictA, strictB, sloppy)
module.exports = strictA + strictB + sloppy
