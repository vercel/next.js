/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  'link-a',
  'move-props',
  'custom-component-child',
  'custom-component-child-legacy-behavior',
  'links-with-legacybehavior-prop',
  'children-interpolation',
  'spread-props',
  'link-string',
  'styled-jsx',
  'handle-duplicate-props'
]

for (const fixture of fixtures) {
  defineTest(
    __dirname,
    'new-link',
    null,
    `new-link/${fixture}`
  )
}
