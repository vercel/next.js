/* global jest */
jest.autoMockOff()

const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  'function-component',
  'function-component-2',
  'function-component-ignore',
  'function-expression',
  'function-expression-ignore',
  'existing-name',
  'existing-name-2',
  'existing-name-3',
  'existing-name-ignore',
  '1-starts-with-number',
  'special-ch@racter',
]

fixtures.forEach((test) =>
  defineTest(
    __dirname,
    'name-default-component',
    null,
    `name-default-component/${test}`
  )
)
