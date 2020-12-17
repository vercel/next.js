/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  /*
   * The file will not be rewrite in this case
   * and the output will be empty
   */
  'without-as',
  'without-imports',
  /*
   * The file will be rewrite in this case
   * and the output will change
   */
  'link-element',
  'router-push',
  'router-replace',
  'this-props-router-push',
  'this-props-router-replace',
  'use-router-push',
  'use-router-replace',
  'import-router-push',
  'import-router-replace',
]

for (const fixture of fixtures) {
  defineTest(
    __dirname,
    'update-router-api',
    null,
    `update-router-api/${fixture}`
  )
}
