import { globalFoo, localFoo, atFoo } from './imports.js'

it('resolves `paths` relative to `baseUrl` from jsconfig.json', () => {
  // All requests are mapped to `./prop.js`
  expect(globalFoo).toBe(1)
  expect(localFoo).toBe(1)
  expect(atFoo).toBe(1)
})
