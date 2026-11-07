import { used } from './lib.js'

function bundledCode() {
  return Array.from(__turbopack_modules__.values(), (factory) =>
    factory.toString()
  ).join('\n')
}

it('drops an unused reexport of a statically imported module', () => {
  expect(used).toBe('USED')

  // Built dynamically so this test file itself doesn't contain the marker.
  expect(bundledCode()).not.toContain(['UNUSED', 'MARKER'].join('_'))
})
