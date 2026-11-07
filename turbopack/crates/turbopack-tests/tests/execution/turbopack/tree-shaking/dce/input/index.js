import { baz } from './module'

if (1 + 1 == 3) {
  baz()
}

it('removes a module only used in dead code', () => {
  const ids = Array.from(__turbopack_modules__.keys())
  expect(ids.some((id) => id.includes('/input/module.js '))).toBe(false)

  const code = Array.from(__turbopack_modules__.values(), (factory) =>
    factory.toString()
  ).join('\n')
  // Built dynamically so this test file itself doesn't contain the marker.
  expect(code).not.toContain(['should', 'not', 'be', 'included'].join(' '))
})
