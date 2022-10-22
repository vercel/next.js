/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  'remove-import',
  'remove-import-renamed',
  'remove-import-single',
  'full-amp',
  'full-amp-inline',
  'full-amp-with-config',
  'full-amp-with-config-dupe',
  'full-amp-with-config-var',
  'hybrid-amp',
  'hybrid-amp-with-config',
]

for (const fixture of fixtures) {
  defineTest(
    __dirname,
    'withamp-to-config',
    null,
    `withamp-to-config/${fixture}`
  )
}
