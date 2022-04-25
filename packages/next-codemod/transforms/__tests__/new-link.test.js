/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtures = [
  'link-a',
  'move-props',
  'add-old-behavior',
  'excludes-links-with-oldbehavior-prop',
  'children-interpolation',
  'spread-props'
]

for (const fixture of fixtures) {
  defineTest(
    __dirname,
    'new-link',
    null,
    `new-link/${fixture}`
  )
}
