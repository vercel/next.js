/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  'missing-react-import-in-component'
]

for (const fixture of fixtures) {
  defineTest(
    __dirname,
    'add-missing-react-import',
    null,
    `add-missing-react-import/${fixture}`
  )
}
