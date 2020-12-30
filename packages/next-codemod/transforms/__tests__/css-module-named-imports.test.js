/* global jest */
jest.autoMockOff()

const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  'single-import',
  'import-mix',
  'existing-named-import',
  'scss-import',
]

fixtures.forEach((test) =>
  defineTest(
    __dirname,
    'css-module-named-imports',
    null,
    `css-module-named-imports/${test}`
  )
)
