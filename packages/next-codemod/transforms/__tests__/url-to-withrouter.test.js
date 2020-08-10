/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  'with-router-import',
  'without-import',
  'already-using-withrouter',
  'using-inline-class',
  'export-default-variable',
  'export-default-variable-wrapping',
  'no-transform',
  'no-transform-method',
  'wrapping-export',
  'variable-export',
  'arrow-function-component',
  'destructuring-this',
  'destructuring-this-class',
  'destructuring-this-props',
  'destructuring-this-props-nested',
  'with-nested-arrow-function',
  'componentdidupdate',
  'componentwillreceiveprops',
  'first-parameter-hoc',
  'url-property-not-part-of-this-props',
]

for (const fixture of fixtures) {
  defineTest(
    __dirname,
    'url-to-withrouter',
    null,
    `url-to-withrouter/${fixture}`
  )
}
